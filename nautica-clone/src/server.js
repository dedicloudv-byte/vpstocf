/* eslint-disable no-console */
const http = require('http');
const https = require('https');
const net = require('net');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { WebSocketServer } = require('ws');

// Enable global fetch in Node 18+
const fetchFn = global.fetch;
if (!fetchFn) {
  throw new Error('This app requires Node 18+ with global fetch');
}

// ---------- Constants & Globals ----------
const BASE64_TROJAN = 'dHJvamFu';
const BASE64_VMESS = 'dm1lc3M=';
const BASE64_V2RAY = 'djJyYXk=';
const BASE64_CLASH = 'Y2xhc2g=';

const DEFAULT_PORTS = [443, 80];
const DEFAULT_PROTOCOLS = [atobCompat(BASE64_TROJAN), atobCompat(BASE64_VMESS), 'ss'];
const SUB_PAGE_URL = 'https://foolvpn.me/nautica';
const KV_PRX_URL = process.env.KV_PRX_URL || 'https://raw.githubusercontent.com/FoolVPN-ID/Nautica/refs/heads/main/kvProxyList.json';
const PRX_BANK_URL = process.env.PRX_BANK_URL || 'https://raw.githubusercontent.com/FoolVPN-ID/Nautica/refs/heads/main/proxyList.txt';
const DNS_SERVER_ADDRESS = '8.8.8.8';
const DNS_SERVER_PORT = 53;
const RELAY_SERVER_UDP = {
  host: 'udp-relay.hobihaus.space',
  port: 7300,
};
const PRX_HEALTH_CHECK_API = 'https://id1.foolvpn.me/api/v1/check';
const CONVERTER_URL = 'https://api.foolvpn.me/convert';

const WS_READY_STATE_OPEN = 1; // ws constant mapping
const WS_READY_STATE_CLOSING = 2;

const CORS_HEADER_OPTIONS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Cache
let cachedPrxList = [];

// ---------- App Setup ----------
const app = express();
app.disable('x-powered-by');
app.use(morgan('dev'));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname + '/../public'));

// ---------- Helpers ----------
function atobCompat(str) {
  return Buffer.from(str, 'base64').toString('utf8');
}
function btoaCompat(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}
function shuffleArray(array) {
  let currentIndex = array.length;
  while (currentIndex !== 0) {
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
}
function getFlagEmoji(isoCode) {
  const codePoints = isoCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
function base64ToArrayBuffer(base64Str) {
  if (!base64Str) {
    return { error: null };
  }
  try {
    const normalized = base64Str.replace(/-/g, '+').replace(/_/g, '/');
    const decode = Buffer.from(normalized, 'base64');
    return { earlyData: decode.buffer.slice(decode.byteOffset, decode.byteOffset + decode.byteLength), error: null };
  } catch (error) {
    return { error };
  }
}
function arrayBufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function getKVPrxList(kvPrxUrl = KV_PRX_URL) {
  if (!kvPrxUrl) throw new Error('No URL Provided!');
  const res = await fetch(kvPrxUrl);
  if (res.status === 200) return res.json();
  return {};
}

async function getPrxList(prxBankUrl = PRX_BANK_URL) {
  if (!prxBankUrl) throw new Error('No URL Provided!');
  const prxBank = await fetch(prxBankUrl);
  if (prxBank.status === 200) {
    const text = (await prxBank.text()) || '';
    const prxString = text.split('\n').filter(Boolean);
    cachedPrxList = prxString
      .map((entry) => {
        const [prxIP, prxPort, country, org] = entry.split(',');
        return {
          prxIP: prxIP || 'Unknown',
          prxPort: prxPort || 'Unknown',
          country: country || 'Unknown',
          org: org || 'Unknown Org',
        };
      })
      .filter(Boolean);
  }
  return cachedPrxList;
}

function safetySetCorsHeaders(res) {
  Object.entries(CORS_HEADER_OPTIONS).forEach(([k, v]) => res.setHeader(k, v));
}

// ---------- HTTP Endpoints ----------
app.options('*', (req, res) => {
  safetySetCorsHeaders(res);
  res.sendStatus(204);
});

app.get('/sub', (req, res) => {
  const host = req.headers.host || '';
  res.redirect(301, `${SUB_PAGE_URL}?host=${host}`);
});

app.get('/check', async (req, res) => {
  try {
    const targetParam = (req.query.target || '').toString();
    const [ip, port] = targetParam.split(':');
    const r = await fetch(`${PRX_HEALTH_CHECK_API}?ip=${ip}:${port || '443'}`);
    const js = await r.json();
    safetySetCorsHeaders(res);
    res.status(200).json(js);
  } catch (e) {
    safetySetCorsHeaders(res);
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/v1/myip', (req, res) => {
  const ip =
    (req.headers['cf-connecting-ipv6'] && req.headers['cf-connecting-ipv6'].toString()) ||
    (req.headers['cf-connecting-ip'] && req.headers['cf-connecting-ip'].toString()) ||
    (req.headers['x-real-ip'] && req.headers['x-real-ip'].toString()) ||
    (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].toString().split(',')[0].trim()) ||
    (req.socket && req.socket.remoteAddress) ||
    '';
  safetySetCorsHeaders(res);
  res.json({ ip, colo: (req.headers['cf-ray'] || '').toString().split('-')[1], cf: null });
});

app.get('/api/v1/sub', async (req, res) => {
  try {
    const urlHost = (req.headers.host || '').toString();
    const serviceName = urlHost.split('.')[0] || '';

    const filterCC = req.query.cc ? req.query.cc.toString().split(',') : [];
    const filterPort = req.query.port ? req.query.port.toString().split(',').map((x) => parseInt(x, 10)) : DEFAULT_PORTS;
    const filterVPN = req.query.vpn ? req.query.vpn.toString().split(',') : DEFAULT_PROTOCOLS;
    const filterLimit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 10;
    const filterFormat = req.query.format ? req.query.format.toString() : 'raw';
    const fillerDomain = req.query.domain ? req.query.domain.toString() : urlHost;
    const prxBankUrl = req.query['prx-list'] ? req.query['prx-list'].toString() : process.env.PRX_BANK_URL;

    const prxList = await getPrxList(prxBankUrl)
      .then((prxs) => {
        if (filterCC.length) return prxs.filter((prx) => filterCC.includes(prx.country));
        return prxs;
      })
      .then((prxs) => {
        shuffleArray(prxs);
        return prxs;
      });

    const uuid = crypto.randomUUID();
    const result = [];
    for (const prx of prxList) {
      const uri = new URL(`${atobCompat(BASE64_TROJAN)}://${fillerDomain}`);
      uri.searchParams.set('encryption', 'none');
      uri.searchParams.set('type', 'ws');
      uri.searchParams.set('host', urlHost);

      for (const port of filterPort) {
        for (const protocol of filterVPN) {
          if (result.length >= filterLimit) break;
          uri.protocol = protocol;
          uri.port = String(port);
          if (protocol === 'ss') {
            uri.username = btoaCompat(`none:${uuid}`);
            uri.searchParams.set(
              'plugin',
              `${atobCompat(BASE64_V2RAY)}-plugin${port === 80 ? '' : ';tls'};mux=0;mode=websocket;path=/${prx.prxIP}-${prx.prxPort};host=${urlHost}`
            );
          } else {
            uri.username = uuid;
          }
          uri.searchParams.set('security', port === 443 ? 'tls' : 'none');
          uri.searchParams.set('sni', port === 80 && protocol === atobCompat(BASE64_VMESS) ? '' : urlHost);
          uri.searchParams.set('path', `/${prx.prxIP}-${prx.prxPort}`);
          uri.hash = `${result.length + 1} ${getFlagEmoji(prx.country)} ${prx.org} WS ${port === 443 ? 'TLS' : 'NTLS'} [${serviceName}]`;
          result.push(uri.toString());
        }
      }
    }

    let finalResult = '';
    if (filterFormat === 'raw') {
      finalResult = result.join('\n');
    } else if (filterFormat === atobCompat(BASE64_V2RAY)) {
      finalResult = btoaCompat(result.join('\n'));
    } else if ([atobCompat(BASE64_CLASH), 'sfa', 'bfr'].includes(filterFormat)) {
      const r = await fetch(CONVERTER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: result.join(','), format: filterFormat, template: 'cf' }),
      });
      if (r.status === 200) finalResult = await r.text();
      else {
        safetySetCorsHeaders(res);
        return res.status(r.status).send(r.statusText);
      }
    }

    safetySetCorsHeaders(res);
    res.status(200).send(finalResult);
  } catch (e) {
    safetySetCorsHeaders(res);
    res.status(500).send(String(e));
  }
});

// ---------- Reverse Proxy Fallback ----------
app.use(async (req, res, next) => {
  try {
    const targetReversePrx = process.env.REVERSE_PRX_TARGET || 'example.com';
    const [hostOnly, portMaybe] = String(targetReversePrx).split(':');
    const port = portMaybe ? Number(portMaybe) : 443;
    const scheme = port === 443 ? 'https' : 'http';
    const targetUrl = new URL(`${scheme}://${hostOnly}${req.originalUrl}`);

    const headers = new Headers();
    // Copy headers but override x-forwarded-host
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(', '));
    }
    headers.set('X-Forwarded-Host', req.headers.host || '');

    const init = { method: req.method, headers };
    // Only pass body for relevant methods
    if (!['GET', 'HEAD'].includes(req.method.toUpperCase())) {
      init.body = req;
      // Let undici infer duplex for streaming body
      init.duplex = 'half';
    }

    const r = await fetch(targetUrl, init);
    // Proxy status, headers, body
    res.status(r.status);
    r.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    // CORS and extra headers
    safetySetCorsHeaders(res);
    res.setHeader('X-Proxied-By', 'Node Server');
    const reader = r.body.getReader();
    res.on('close', () => reader.cancel().catch(() => {}));
    res.on('error', () => reader.cancel().catch(() => {}));
    // Stream to response
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    safetySetCorsHeaders(res);
    res.status(500).send(`An error occurred: ${String(err)}`);
  }
});

// ---------- WebSocket Upgrade ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  try {
    const upgradeHeader = req.headers['upgrade'];
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    if (upgradeHeader !== 'websocket') {
      socket.destroy();
      return;
    }

    // Match path: /<IP:PORT> or /<IP-PORT> or /<CC,CC>
    const prxMatch = urlObj.pathname.match(/^\/(.+[:=-]\d+)$/);
    let selectedPrxIP = '';
    if (urlObj.pathname.length === 3 || urlObj.pathname.includes(',')) {
      const prxKeys = urlObj.pathname.replace('/', '').toUpperCase().split(',');
      const prxKey = prxKeys[Math.floor(Math.random() * prxKeys.length)];
      const kvPrx = await getKVPrxList();
      const arr = kvPrx[prxKey] || [];
      selectedPrxIP = arr[Math.floor(Math.random() * arr.length)] || '';
    } else if (prxMatch) {
      selectedPrxIP = prxMatch[1];
    } else {
      // Not a recognized WS path
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      // Attach per-connection state
      ws._selectedPrxIP = selectedPrxIP;
      ws._earlyDataHeader = (req.headers['sec-websocket-protocol'] || '').toString();
      onWsConnection(ws, req);
    });
  } catch (e) {
    try {
      socket.destroy();
    } catch (_) {}
  }
});

wss.on('connection', onWsConnection);

function onWsConnection(ws, req) {
  // State per connection
  let addressLog = '';
  let portLog = '';
  let remoteSocket = null; // net.Socket
  let hasIncomingData = false;
  let isDNS = false;

  function log(info, evt) {
    console.log(`[${addressLog}:${portLog}] ${info}`, evt || '');
  }

  // Early data
  const { earlyData } = base64ToArrayBuffer(ws._earlyDataHeader || '');
  if (earlyData && earlyData.byteLength) {
    // Inject early data into message flow
    setImmediate(() => handleWSMessage(Buffer.from(earlyData)));
  }

  ws.on('message', (data) => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    handleWSMessage(chunk);
  });

  ws.on('close', () => {
    safeCloseWebSocket(ws);
    tryCloseRemote();
  });
  ws.on('error', () => {
    tryCloseRemote();
  });

  function tryCloseRemote() {
    try {
      if (remoteSocket) remoteSocket.destroy();
    } catch (_) {}
  }

  async function handleWSMessage(chunk) {
    try {
      if (isDNS) {
        return handleUDPOutbound(
          DNS_SERVER_ADDRESS,
          DNS_SERVER_PORT,
          chunk,
          ws,
          null,
          log,
          RELAY_SERVER_UDP
        );
      }
      if (remoteSocket) {
        remoteSocket.write(chunk);
        return;
      }

      const protocol = await protocolSniffer(chunk);
      let protocolHeader;
      if (protocol === atobCompat(BASE64_TROJAN)) {
        protocolHeader = readHorseHeader(chunk);
      } else if (protocol === atobCompat(BASE64_VMESS)) {
        protocolHeader = readFlashHeader(chunk);
      } else if (protocol === 'ss') {
        protocolHeader = readSsHeader(chunk);
      } else {
        throw new Error('Unknown Protocol!');
      }

      addressLog = protocolHeader.addressRemote;
      portLog = `${protocolHeader.portRemote} -> ${protocolHeader.isUDP ? 'UDP' : 'TCP'}`;

      if (protocolHeader.hasError) {
        throw new Error(protocolHeader.message);
      }

      if (protocolHeader.isUDP) {
        if (protocolHeader.portRemote === 53) {
          isDNS = true;
          return handleUDPOutbound(
            DNS_SERVER_ADDRESS,
            DNS_SERVER_PORT,
            chunk,
            ws,
            protocolHeader.version,
            log,
            RELAY_SERVER_UDP
          );
        }
        return handleUDPOutbound(
          protocolHeader.addressRemote,
          protocolHeader.portRemote,
          chunk,
          ws,
          protocolHeader.version,
          log,
          RELAY_SERVER_UDP
        );
      }

      await handleTCPOutBound(
        (sock) => {
          remoteSocket = sock;
          remoteSocket.on('data', async (data) => {
            hasIncomingData = true;
            if (ws.readyState !== WS_READY_STATE_OPEN) return;
            if (protocolHeader && protocolHeader.version) {
              const header = Buffer.from(protocolHeader.version);
              ws.send(Buffer.concat([header, data]));
              protocolHeader.version = null;
            } else {
              ws.send(data);
            }
          });
          remoteSocket.on('close', () => {
            log(`remote connection closed with hasIncomingData=${hasIncomingData}`);
            if (!hasIncomingData) {
              retry();
            } else {
              safeCloseWebSocket(ws);
            }
          });
          remoteSocket.on('error', (err) => {
            console.error('remote socket error', err);
            safeCloseWebSocket(ws);
          });
        },
        protocolHeader.addressRemote,
        protocolHeader.portRemote,
        protocolHeader.rawClientData,
        ws,
        protocolHeader.version,
        log,
        () => retry()
      );

      function retry() {
        const prxIP = (ws._selectedPrxIP || '').toString();
        const parts = prxIP.split(/[:=-]/);
        const altAddr = parts[0] || protocolHeader.addressRemote;
        const altPort = Number(parts[1] || protocolHeader.portRemote);
        handleTCPOutBound(
          (sock) => {
            remoteSocket = sock;
            remoteSocket.on('data', (data) => {
              if (ws.readyState !== WS_READY_STATE_OPEN) return;
              ws.send(data);
            });
            remoteSocket.on('close', () => safeCloseWebSocket(ws));
          },
          altAddr,
          altPort,
          protocolHeader.rawClientData,
          ws,
          protocolHeader.version,
          log
        );
      }
    } catch (e) {
      console.error('WS message error', e);
      safeCloseWebSocket(ws);
    }
  }
}

async function protocolSniffer(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.byteLength >= 62) {
    const horseDelimiter = new Uint8Array(buf.subarray(56, 60));
    if (horseDelimiter[0] === 0x0d && horseDelimiter[1] === 0x0a) {
      if (horseDelimiter[2] === 0x01 || horseDelimiter[2] === 0x03 || horseDelimiter[2] === 0x7f) {
        if (horseDelimiter[3] === 0x01 || horseDelimiter[3] === 0x03 || horseDelimiter[3] === 0x04) {
          return atobCompat(BASE64_TROJAN);
        }
      }
    }
  }
  const flashDelimiter = new Uint8Array(buf.subarray(1, 17));
  if (arrayBufferToHex(flashDelimiter.buffer).match(/^[0-9a-f]{8}[0-9a-f]{4}4[0-9a-f]{3}[89ab][0-9a-f]{3}[0-9a-f]{12}$/i)) {
    return atobCompat(BASE64_VMESS);
  }
  return 'ss';
}

function readSsHeader(ssBuffer) {
  const buf = Buffer.isBuffer(ssBuffer) ? ssBuffer : Buffer.from(ssBuffer);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const addressType = view.getUint8(0);
  let addressLength = 0;
  let addressValueIndex = 1;
  let addressValue = '';
  switch (addressType) {
    case 1: {
      addressLength = 4;
      addressValue = new Uint8Array(buf.subarray(addressValueIndex, addressValueIndex + addressLength)).join('.');
      break;
    }
    case 3: {
      addressLength = new Uint8Array(buf.subarray(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(buf.subarray(addressValueIndex, addressValueIndex + addressLength));
      break;
    }
    case 4: {
      addressLength = 16;
      const dataView = new DataView(buf.buffer, buf.byteOffset + addressValueIndex, addressLength);
      const ipv6 = [];
      for (let i = 0; i < 8; i++) ipv6.push(dataView.getUint16(i * 2).toString(16));
      addressValue = ipv6.join(':');
      break;
    }
    default:
      return { hasError: true, message: `Invalid addressType for SS: ${addressType}` };
  }
  if (!addressValue) return { hasError: true, message: `Destination address empty, address type is: ${addressType}` };
  const portIndex = addressValueIndex + addressLength;
  const portBuffer = buf.subarray(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer.buffer, portBuffer.byteOffset, 2).getUint16(0);
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType,
    portRemote,
    rawDataIndex: portIndex + 2,
    rawClientData: buf.subarray(portIndex + 2),
    version: null,
    isUDP: portRemote == 53,
  };
}

function readFlashHeader(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const version = new Uint8Array(buf.subarray(0, 1));
  let isUDP = false;
  const optLength = new Uint8Array(buf.subarray(17, 18))[0];
  const cmd = new Uint8Array(buf.subarray(18 + optLength, 18 + optLength + 1))[0];
  if (cmd === 1) {
    // TCP
  } else if (cmd === 2) {
    isUDP = true;
  } else {
    return { hasError: true, message: `command ${cmd} is not supported` };
  }
  const portIndex = 18 + optLength + 1;
  const portBuffer = buf.subarray(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer.buffer, portBuffer.byteOffset, 2).getUint16(0);
  let addressIndex = portIndex + 2;
  const addressBuffer = new Uint8Array(buf.subarray(addressIndex, addressIndex + 1));
  const addressType = addressBuffer[0];
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = '';
  switch (addressType) {
    case 1: {
      addressLength = 4;
      addressValue = new Uint8Array(buf.subarray(addressValueIndex, addressValueIndex + addressLength)).join('.');
      break;
    }
    case 2: {
      addressLength = new Uint8Array(buf.subarray(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(buf.subarray(addressValueIndex, addressValueIndex + addressLength));
      break;
    }
    case 3: {
      addressLength = 16;
      const dataView = new DataView(buf.buffer, buf.byteOffset + addressValueIndex, addressLength);
      const ipv6 = [];
      for (let i = 0; i < 8; i++) ipv6.push(dataView.getUint16(i * 2).toString(16));
      addressValue = ipv6.join(':');
      break;
    }
    default:
      return { hasError: true, message: `invild  addressType is ${addressType}` };
  }
  if (!addressValue) return { hasError: true, message: `addressValue is empty, addressType is ${addressType}` };
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType,
    portRemote,
    rawDataIndex: addressValueIndex + addressLength,
    rawClientData: buf.subarray(addressValueIndex + addressLength),
    version: new Uint8Array([version[0], 0]),
    isUDP,
  };
}

function readHorseHeader(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const dataBuffer = buf.subarray(58);
  if (dataBuffer.byteLength < 6) return { hasError: true, message: 'invalid request data' };
  let isUDP = false;
  const view = new DataView(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength);
  const cmd = view.getUint8(0);
  if (cmd === 3) isUDP = true;
  else if (cmd !== 1) throw new Error('Unsupported command type!');
  let addressType = view.getUint8(1);
  let addressLength = 0;
  let addressValueIndex = 2;
  let addressValue = '';
  switch (addressType) {
    case 1: {
      addressLength = 4;
      addressValue = new Uint8Array(dataBuffer.subarray(addressValueIndex, addressValueIndex + addressLength)).join('.');
      break;
    }
    case 3: {
      addressLength = new Uint8Array(dataBuffer.subarray(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(dataBuffer.subarray(addressValueIndex, addressValueIndex + addressLength));
      break;
    }
    case 4: {
      addressLength = 16;
      const dataView = new DataView(dataBuffer.buffer, dataBuffer.byteOffset + addressValueIndex, addressLength);
      const ipv6 = [];
      for (let i = 0; i < 8; i++) ipv6.push(dataView.getUint16(i * 2).toString(16));
      addressValue = ipv6.join(':');
      break;
    }
    default:
      return { hasError: true, message: `invalid addressType is ${addressType}` };
  }
  if (!addressValue) return { hasError: true, message: `address is empty, addressType is ${addressType}` };
  const portIndex = addressValueIndex + addressLength;
  const portBuffer = dataBuffer.subarray(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer.buffer, portBuffer.byteOffset, 2).getUint16(0);
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType,
    portRemote,
    rawDataIndex: portIndex + 4,
    rawClientData: dataBuffer.subarray(portIndex + 4),
    version: null,
    isUDP,
  };
}

async function handleTCPOutBound(onSocket, addressRemote, portRemote, rawClientData, webSocket, responseHeader, log, onNoDataRetry) {
  function connectAndWrite(address, port) {
    return new Promise((resolve, reject) => {
      const tcpSocket = net.createConnection({ host: address, port }, () => {
        try {
          if (rawClientData && rawClientData.length) {
            tcpSocket.write(rawClientData);
          }
        } catch (e) {
          console.error('write rawClientData error', e);
        }
        resolve(tcpSocket);
      });
      tcpSocket.on('error', (err) => reject(err));
    });
  }
  try {
    const tcpSocket = await connectAndWrite(addressRemote, portRemote);
    onSocket(tcpSocket);
  } catch (e) {
    console.error('connect error', e);
    if (onNoDataRetry) onNoDataRetry();
    else safeCloseWebSocket(webSocket);
  }
}

async function handleUDPOutbound(targetAddress, targetPort, dataChunk, webSocket, responseHeader, log, relay) {
  try {
    let protocolHeader = responseHeader;
    const tcpSocket = net.createConnection({ host: relay.host, port: relay.port });
    const headerStr = `udp:${targetAddress}:${targetPort}`;
    const headerBuffer = Buffer.from(headerStr, 'utf8');
    const separator = Buffer.from([0x7c]);
    const relayMessage = Buffer.concat([headerBuffer, separator, Buffer.from(dataChunk)]);
    tcpSocket.write(relayMessage);
    tcpSocket.on('data', async (chunk) => {
      if (webSocket.readyState === WS_READY_STATE_OPEN) {
        if (protocolHeader) {
          const header = Buffer.from(protocolHeader);
          webSocket.send(Buffer.concat([header, chunk]));
          protocolHeader = null;
        } else {
          webSocket.send(chunk);
        }
      }
    });
    tcpSocket.on('close', () => {
      log(`UDP connection to ${targetAddress} closed`);
    });
    tcpSocket.on('error', (reason) => {
      console.error(`UDP connection aborted due to ${reason}`);
    });
  } catch (e) {
    console.error(`Error while handling UDP outbound: ${e.message}`);
  }
}

function safeCloseWebSocket(socket) {
  try {
    if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
      socket.close();
    }
  } catch (error) {
    console.error('safeCloseWebSocket error', error);
  }
}

// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Nautica clone server listening on http://localhost:${PORT}`);
});


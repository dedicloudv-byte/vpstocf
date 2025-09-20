import { connect } from 'cloudflare:sockets'

/**
 * Cloudflare Worker: VLESS over WebSocket with TCP relay, DNS(DoH), and simple link generator.
 * - Path for WS tunnel is configurable via env.WS_PATH (default: "/ws")
 * - Validates client UUID (env.UUID) per VLESS spec
 * - TCP: bridges to destination from VLESS request header using Cloudflare Sockets API
 * - UDP/DNS: handles DNS over HTTPS (DoH) for port 53 as a practical UDP proxy subset
 * - Dashboard (/dash): generate importable VLESS link and Clash YAML; supports custom proxy port, path, and SNI
 */

const DEFAULT_WS_PATH = '/ws'

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		const wsPath = (env.WS_PATH || DEFAULT_WS_PATH).startsWith('/')
			? env.WS_PATH || DEFAULT_WS_PATH
			: `/${env.WS_PATH}`

		// WebSocket (VLESS) endpoint
		if (url.pathname === wsPath && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
			return handleVlessOverWS(request, env)
		}

		// Subscription endpoints
		if (url.pathname === '/vless') {
			return new Response(generateVlessLink(url, env, request), { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
		}
		if (url.pathname === '/clash') {
			return new Response(generateClashYaml(url, env, request), { status: 200, headers: { 'content-type': 'text/yaml; charset=utf-8' } })
		}
		if (url.pathname === '/sub') {
			const body = `${generateVlessLink(url, env, request)}\n`
			const payload = btoaUnicode(body)
			return new Response(payload, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
		}

		// Dashboard UI
		if (url.pathname === '/dash') {
			return new Response(renderDashHtml(env, request), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
		}

		// Simple landing page
		if (url.pathname === '/' || url.pathname === '/healthz') {
			return new Response(`OK\n` +
				`- WS: ${wsPath}\n` +
				`- VLESS: /vless\n` +
				`- Clash: /clash\n` +
				`- Subscription: /sub\n` +
				`- Dashboard: /dash\n`, {
				headers: { 'content-type': 'text/plain; charset=utf-8' }
			})
		}

		return new Response('Not Found', { status: 404 })
	},
}

async function handleVlessOverWS(request, env) {
	const pair = new WebSocketPair()
	const [client, server] = Object.values(pair)
	server.accept()
	server.binaryType = 'arraybuffer'

	let authenticated = false
	let tcpSocket = null
	let tcpWriter = null
	let tcpReader = null
	let closing = false

	const uuidBytes = uuidToBytes(env.UUID)

	const closeAll = (code = 1000, reason = 'normal closure') => {
		if (closing) return
		closing = true
		try { server.close(code, reason) } catch {}
		try { tcpSocket?.close?.() } catch {}
	}

	const pumpTcpToWs = async () => {
		if (!tcpReader) return
		try {
			while (true) {
				const { value, done } = await tcpReader.read()
				if (done) break
				if (value && value.byteLength > 0) {
					server.send(value)
				}
			}
		} catch (_) {
			// ignore
		} finally {
			closeAll()
		}
	}

	server.addEventListener('message', async (evt) => {
		try {
			const buf = evt.data instanceof ArrayBuffer ? new Uint8Array(evt.data) : new Uint8Array(await evt.data.arrayBuffer?.())
			if (!authenticated) {
				const parsed = parseVlessRequest(buf, uuidBytes)
				if (!parsed.ok) {
					server.send(parsed.err?.message ? new TextEncoder().encode(parsed.err.message) : new Uint8Array())
					return closeAll(1008, 'unauthorized or bad request')
				}
				const { command, address, port, payloadOffset } = parsed
				// Only support TCP (0x01) fully. UDP (0x02) limited to DNS over HTTPS when port 53
				if (command === 0x02) {
					// Send minimal VLESS response header
					server.send(new Uint8Array([0x00, 0x00]))
					authenticated = true
					const firstUdpPayload = buf.subarray(payloadOffset)
					if (port === 53) {
						const dohResp = await dnsOverHttps(firstUdpPayload)
						server.send(new Uint8Array(dohResp))
					}
					// Keep connection open for possible subsequent DNS messages
					return
				}

				if (command !== 0x01) {
					server.send(new TextEncoder().encode('Command not supported'))
					return closeAll(1003, 'unsupported command')
				}

				// TCP connect via Cloudflare Sockets API
				try {
					tcpSocket = connect({ hostname: address, port })
					tcpWriter = tcpSocket.writable.getWriter()
					tcpReader = tcpSocket.readable.getReader()
				} catch (e) {
					server.send(new TextEncoder().encode('Dial failed'))
					return closeAll(1011, 'dial failed')
				}

				// Send minimal VLESS response header to client
				server.send(new Uint8Array([0x00, 0x00]))
				authenticated = true

				// forward any leftover payload immediately
				const firstPayload = buf.subarray(payloadOffset)
				if (firstPayload.byteLength > 0) {
					await tcpWriter.write(firstPayload)
				}

				// Start pumping TCP -> WS
				pumpTcpToWs()
			} else {
				// After handshake, just forward to TCP
				if (tcpWriter && (evt.data instanceof ArrayBuffer || typeof evt.data?.arrayBuffer === 'function')) {
					const chunk = evt.data instanceof ArrayBuffer ? new Uint8Array(evt.data) : new Uint8Array(await evt.data.arrayBuffer())
					if (chunk.byteLength > 0) {
						await tcpWriter.write(chunk)
					}
				}
			}
		} catch (_) {
			closeAll(1011, 'internal error')
		}
	})

	server.addEventListener('close', () => closeAll())
	server.addEventListener('error', () => closeAll(1011, 'websocket error'))

	return new Response(null, { status: 101, webSocket: client })
}

function parseVlessRequest(u8, uuidBytes) {
	try {
		let p = 0
		if (u8.byteLength < 22) return { ok: false, err: new Error('short header') }
		const version = u8[p++]
		if (version !== 0x00) return { ok: false, err: new Error('bad version') }
		const user = u8.subarray(p, p + 16)
		p += 16
		if (!bytesEq(user, uuidBytes)) return { ok: false, err: new Error('bad uuid') }
		const optLen = u8[p++]
		p += optLen // skip options
		if (p + 3 > u8.length) return { ok: false, err: new Error('bad header2') }
		const cmd = u8[p++]
		const _rsv = u8[p++] // reserved
		const addrType = u8[p++]
		let address = ''
		if (addrType === 0x01) {
			if (p + 4 > u8.length) return { ok: false, err: new Error('bad ipv4') }
			address = [...u8.subarray(p, p + 4)].join('.')
			p += 4
		} else if (addrType === 0x02) {
			const len = u8[p++]
			if (p + len > u8.length) return { ok: false, err: new Error('bad domain') }
			address = new TextDecoder().decode(u8.subarray(p, p + len))
			p += len
		} else if (addrType === 0x03) {
			if (p + 16 > u8.length) return { ok: false, err: new Error('bad ipv6') }
			const parts = []
			for (let i = 0; i < 16; i += 2) {
				parts.push(((u8[p + i] << 8) | u8[p + i + 1]).toString(16))
			}
			address = parts.join(':')
			p += 16
		} else {
			return { ok: false, err: new Error('bad atype') }
		}
		if (p + 2 > u8.length) return { ok: false, err: new Error('bad port') }
		const port = (u8[p] << 8) | u8[p + 1]
		p += 2
		return { ok: true, command: cmd, address, port, payloadOffset: p }
	} catch (e) {
		return { ok: false, err: e }
	}
}

async function dnsOverHttps(packetU8) {
	const resp = await fetch('https://cloudflare-dns.com/dns-query', {
		method: 'POST',
		headers: { 'content-type': 'application/dns-message' },
		body: packetU8,
	})
	if (!resp.ok) {
		return new Uint8Array()
	}
	return new Uint8Array(await resp.arrayBuffer())
}

function generateVlessLink(url, env, request) {
	const host = url.searchParams.get('host') || request.headers.get('Host') || ''
	const sni = url.searchParams.get('sni') || host
	const path = normalizePath(url.searchParams.get('path') || env.WS_PATH || DEFAULT_WS_PATH)
	const uuid = env.UUID || url.searchParams.get('uuid') || crypto.randomUUID()
	const fp = url.searchParams.get('fp') || 'chrome'
	const alpn = url.searchParams.get('alpn') || 'h2,http/1.1'
	const name = url.searchParams.get('name') || env.SUB_NAME || 'VLESS-WS-CDN'
	const reverse = url.searchParams.get('reverse') === '1'
	const viaPort = url.searchParams.get('port') || '443'
	const tls = url.searchParams.get('tls') ?? '1'

	const finalHost = reverse ? reverseDomain(host) : host
	const useTls = tls === '1' || viaPort === '443'
	const link = `vless://${uuid}@${finalHost}:${viaPort}?encryption=none&type=ws&path=${encodeURIComponent(path)}&host=${encodeURIComponent(finalHost)}${useTls ? `&security=tls&sni=${encodeURIComponent(sni)}&fp=${encodeURIComponent(fp)}&alpn=${encodeURIComponent(alpn)}` : ''}#${encodeURIComponent(name)}`
	return link
}

function generateClashYaml(url, env, request) {
	const host = url.searchParams.get('host') || request.headers.get('Host') || ''
	const sni = url.searchParams.get('sni') || host
	const path = normalizePath(url.searchParams.get('path') || env.WS_PATH || DEFAULT_WS_PATH)
	const uuid = env.UUID || url.searchParams.get('uuid') || crypto.randomUUID()
	const name = url.searchParams.get('name') || env.SUB_NAME || 'VLESS-WS-CDN'
	const reverse = url.searchParams.get('reverse') === '1'
	const viaPort = parseInt(url.searchParams.get('port') || '443', 10)
	const tls = url.searchParams.get('tls') ?? '1'

	const finalHost = reverse ? reverseDomain(host) : host
	const useTls = tls === '1' || viaPort === 443
	return `proxies:\n` +
		`  - name: ${yamlEscape(name)}\n` +
		`    type: vless\n` +
		`    server: ${yamlEscape(finalHost)}\n` +
		`    port: ${viaPort}\n` +
		`    uuid: ${yamlEscape(uuid)}\n` +
		`    udp: true\n` +
		`    tls: ${useTls ? 'true' : 'false'}\n` +
		(useTls ? `    sni: ${yamlEscape(sni)}\n` : '') +
		`    network: ws\n` +
		`    ws-opts:\n` +
		`      path: ${yamlEscape(path)}\n` +
		`      headers:\n` +
		`        Host: ${yamlEscape(finalHost)}\n`
}

function renderDashHtml(env, request) {
	const host = new URL(request.url).host
	const wsPath = env.WS_PATH || DEFAULT_WS_PATH
	const uuid = env.UUID || crypto.randomUUID()
	return `<!doctype html>
<html lang="id">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>VLESS Worker Dashboard</title>
<style>
  body{font:14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, sans-serif;max-width:880px;margin:24px auto;padding:0 16px;}
  input,select,textarea{font:inherit;padding:8px 10px;border:1px solid #d0d7de;border-radius:8px;width:100%;}
  label{font-weight:600;margin-top:14px;display:block}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .col{display:flex;flex-direction:column}
  .card{border:1px solid #d0d7de;border-radius:12px;padding:16px;margin-top:16px}
  .muted{color:#57606a}
  code{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:2px 6px}
  .copy{margin-top:8px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  textarea{min-height:120px}
</style>
<body>
  <h2>VLESS Worker</h2>
  <p class="muted">Domain CDN: <code>${host}</code> · WS Path: <code>${wsPath}</code></p>

  <div class="card">
    <div class="row">
      <div class="col">
        <label>UUID</label>
        <input id="uuid" value="${uuid}" />
      </div>
      <div class="col">
        <label>Proxy Port (80/443/…) </label>
        <input id="port" value="443" />
      </div>
    </div>
    <div class="row">
      <div class="col">
        <label>WS Path</label>
        <input id="path" value="${wsPath}" />
      </div>
      <div class="col">
        <label>SNI (opsional)</label>
        <input id="sni" value="${host}" />
      </div>
    </div>
    <div class="row">
      <div class="col">
        <label>Reverse Domain</label>
        <select id="reverse"><option value="0">Tidak</option><option value="1">Ya</option></select>
      </div>
      <div class="col">
        <label>TLS</label>
        <select id="tls"><option value="1">Ya</option><option value="0">Tidak</option></select>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="grid2">
      <div>
        <label>VLESS Link</label>
        <textarea id="vless" readonly></textarea>
        <button class="copy" onclick="copy('vless')">Copy</button>
      </div>
      <div>
        <label>Clash YAML (proxy)</label>
        <textarea id="clash" readonly></textarea>
        <button class="copy" onclick="copy('clash')">Copy</button>
      </div>
    </div>
  </div>

  <script>
  const host='${host}';
  function build(){
    const uuid=document.getElementById('uuid').value.trim();
    const port=document.getElementById('port').value.trim()||'443';
    const path=document.getElementById('path').value.trim()||'${wsPath}';
    const sni=document.getElementById('sni').value.trim()||host;
    const reverse=document.getElementById('reverse').value==='1';
    const tls=document.getElementById('tls').value==='1';
    const finalHost= reverse ? host.split('').reverse().join('') : host;
    const qs = new URLSearchParams({ host: host, sni, path, uuid, port, reverse: reverse?'1':'0', tls: tls?'1':'0' });
    fetch('/vless?'+qs.toString()).then(r=>r.text()).then(t=>{document.getElementById('vless').value=t})
    fetch('/clash?'+qs.toString()).then(r=>r.text()).then(t=>{document.getElementById('clash').value=t})
  }
  function copy(id){ const ta=document.getElementById(id); ta.select(); document.execCommand('copy'); }
  ['uuid','port','path','sni','reverse','tls'].forEach(id=>document.getElementById(id).addEventListener('input',build));
  build();
  </script>
</body>
</html>`
}

function reverseDomain(s) {
	return s.split('').reverse().join('')
}

function normalizePath(p) {
	if (!p) return DEFAULT_WS_PATH
	return p.startsWith('/') ? p : '/' + p
}

function yamlEscape(s) {
	return '"' + String(s).replace(/"/g, '\\"') + '"'
}

function btoaUnicode(str) {
	return btoa(unescape(encodeURIComponent(str)))
}

function bytesEq(a, b) {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
	return true
}

function uuidToBytes(uuid) {
	const hex = (uuid || '').replace(/-/g, '').toLowerCase()
	if (hex.length !== 32) return new Uint8Array(16)
	const out = new Uint8Array(16)
	for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
	return out
}
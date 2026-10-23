import net from "node:net";
import http from "node:http";

const messages = [];
net
  .createServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 test-mailbox ESMTP\r\n");
    let buffer = "";
    let data = null;
    let recipient = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data !== null) {
          if (line === ".") {
            const raw = data.join("\r\n");
            const bodyStart = raw.indexOf("\r\n\r\n");
            let html = raw.slice(bodyStart + 4);
            if (/Content-Transfer-Encoding: base64/i.test(raw.slice(0, bodyStart))) {
              html = Buffer.from(html, "base64").toString("utf8");
            } else {
              html = html
                .replace(/=\r\n/g, "")
                .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
            }
            const path = /\/onboarding\/invitation\/[A-Za-z0-9_-]{43}(?:\?lang=fr)?/.exec(
              html
            )?.[0];
            if (path) messages.push({ recipient: recipient.toLowerCase(), path });
            if (messages.length > 100) messages.shift();
            data = null;
            socket.write("250 stored\r\n");
          } else data.push(line.replace(/^\.\./, "."));
        } else if (/^EHLO|^HELO/i.test(line)) {
          socket.write("250-test-mailbox\r\n250-AUTH PLAIN\r\n250 SIZE 1000000\r\n");
        } else if (/^AUTH PLAIN/i.test(line)) socket.write("235 authenticated\r\n");
        else if (/^RCPT TO:/i.test(line)) {
          recipient = /<([^>]+)>/.exec(line)?.[1] ?? "";
          socket.write("250 recipient\r\n");
        } else if (/^DATA$/i.test(line)) {
          data = [];
          socket.write("354 end with dot\r\n");
        } else if (/^QUIT$/i.test(line)) socket.end("221 goodbye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
    socket.on("error", () => {});
  })
  .listen(Number(process.env.TEST_SMTP_PORT ?? 1025), "0.0.0.0");

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://test-mailbox");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/health") return res.end('{"status":"ok"}');
    const message = messages.findLast((m) => m.recipient === url.searchParams.get("email"));
    res.statusCode = message ? 200 : 404;
    res.end(JSON.stringify(message ? { path: message.path } : { error: "not received" }));
  })
  .listen(Number(process.env.TEST_MAILBOX_PORT ?? 1085), "0.0.0.0");

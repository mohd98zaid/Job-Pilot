const fs = require('fs');
let code = fs.readFileSync('artifacts/jobpilot/src/pages/JobPilot.tsx', 'utf8');

const pingOld = `            if (b.name.includes("Ollama")) {
              const res = await fetch(b.url.replace(/\\/api\\/generate|\\/v1\\/.*/, ""), { method: "GET" });
              newHealth[b.name] = res.ok ? "connected" : "error";`;

const pingNew = `            if (b.name.includes("Ollama")) {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 2000);
              try {
                const res = await fetch(b.url.replace(/\\/api\\/generate|\\/v1\\/.*/, ""), { method: "GET", signal: controller.signal });
                clearTimeout(timeoutId);
                newHealth[b.name] = res.ok ? "connected" : "error";
              } catch (err) {
                clearTimeout(timeoutId);
                newHealth[b.name] = "error";
              }`;

code = code.replace(pingOld, pingNew);
fs.writeFileSync('artifacts/jobpilot/src/pages/JobPilot.tsx', code);
console.log('Fixed ollama ping timeout');

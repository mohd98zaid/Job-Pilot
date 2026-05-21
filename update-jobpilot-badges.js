const fs = require('fs');
let code = fs.readFileSync('artifacts/jobpilot/src/pages/JobPilot.tsx', 'utf8');

// Unexpanded card badge
const oldBadge1 = `<span style={{ fontSize: 10, color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4, fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>{job.source}</span>`;
const newBadge1 = `<div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                              <span style={{ fontSize: 10, color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4, fontFamily: "'Space Mono', monospace" }}>{job.source}</span>
                              {job.additionalSources?.map((s, idx) => (
                                <span key={idx} style={{ fontSize: 10, color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4, fontFamily: "'Space Mono', monospace" }}>{s.source}</span>
                              ))}
                            </div>`;
code = code.replace(oldBadge1, newBadge1);

// Tracker UI badge
const oldBadge2 = `<td style={{ padding: "14px 16px", color: "var(--muted)", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{j.source}</td>`;
const newBadge2 = `<td style={{ padding: "14px 16px", color: "var(--muted)", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              <span style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>{j.source}</span>
                              {j.additionalSources?.map((s, idx) => (
                                <span key={idx} style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>{s.source}</span>
                              ))}
                            </div>
                          </td>`;
code = code.replace(oldBadge2, newBadge2);

fs.writeFileSync('artifacts/jobpilot/src/pages/JobPilot.tsx', code);
console.log('Update badges success');

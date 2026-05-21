import { chromium } from "patchright";

const sessionId = `bcookie="v=2&c0324b41-9b09-480d-8b45-e83f306a34d9"; bscookie="v=1&20260414062712774ee70f-3369-4758-8031-2eb39d1a046bAQFAlZbvyyzLEb2F954LX7ILm8SNTfEK"; _gcl_au=1.1.1813916240.1776148044; li_rm=AQH85YYhiNDt8wAAAZ2KrFgqAdkkp0Uc4gtdgoiQ20mbnA1pFiD1lKE-laPUuXrOd60Cj1bcciFVRPW8SGgcONGSXnUOzjCZ7jj_42AWTXV1J2qUjhO2nljWB2bCxbl28Bsptd0Ix9oKyXc9FlBwKQen-DoZM2TAdqSbooKdHwApQv_GKuT8u9o1DXFgojENQbxf2cf3iduNc4drd9UdHuixrFPnne_LmUe-98f3wACiT38VypAsyYKkSPB81hHbtErc_ZxfM9CINIEigWcqG9d3SfjAAqAXuO5xrM3AkTo18oONs05XhwTiV4QuCmkNF4is5AWQSpeF1pYK6lY0kQ; JSESSIONID="ajax:7329992990267429972"; g_state={"i_l":0}; timezone=Asia/Calcutta; li_theme=light; li_theme_set=app; _pxvid=fd8d3510-37ca-11f1-98aa-d8a8a5c75472; dfpfpt=3939721173e84c8e85a5b3df1f6e0025; li_sugr=5c872bf1-7fae-40a1-8c2b-fc3a8f2ee11a; aam_uuid=24835244172183657722235966372035641745; AMCVS_14215E3D5995C57C0A495C55%40AdobeOrg=1; UserMatchHistory=AQK__BIfK6PnGQAAAZ5AHjrtpJCQ9wyWNFV92_eBtl7tPLa1Z_0W5YLPTVV5oUXDZpDynTaC49NudQ`;

async function test() {
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
    timezoneId: "Asia/Dubai",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    },
    javaScriptEnabled: true,
  });
  
  const sessionId = `[
    {
        "domain": ".linkedin.com",
        "expirationDate": 1794884760,
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_ips",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "730"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1781784184.514886,
        "hostOnly": false,
        "httpOnly": false,
        "name": "lms_ads",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "AQEU3FlVrd4A3QAAAZ5AHjznjMjw0LILers4OcZI0hQ4LH1p14HF2PsjE7mSPJB_qP1mpg2BwolxxjZgonQDE9ytmYqoKtxf"
    },
    {
        "domain": "www.linkedin.com",
        "expirationDate": 1810886185,
        "hostOnly": true,
        "httpOnly": false,
        "name": "_pxvid",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "fd8d3510-37ca-11f1-98aa-d8a8a5c75472"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1810889578.017259,
        "hostOnly": false,
        "httpOnly": false,
        "name": "bcookie",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "\\\"v=2&c0324b41-9b09-480d-8b45-e83f306a34d9\\\""
    },
    {
        "domain": "www.linkedin.com",
        "expirationDate": 1779866061.600272,
        "hostOnly": true,
        "httpOnly": false,
        "name": "fid",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "AQG4oGW8BU2tdAAAAZ5EPEYtmtGcj0uyQXwPa53VLxlaHK2buc0C_atLfiBBZgpF8l3ypGA1voUkuQ"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1810889575.837267,
        "hostOnly": false,
        "httpOnly": false,
        "name": "sdui_ver",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "sdui-flagship:0.1.40551+SduiFlagship0"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1783924044,
        "hostOnly": false,
        "httpOnly": false,
        "name": "_gcl_au",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "1.1.1813916240.1776148044"
    },
    {
        "domain": "www.linkedin.com",
        "expirationDate": 1791700045,
        "hostOnly": true,
        "httpOnly": false,
        "name": "g_state",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "{\\\"i_l\\\":0}"
    },
    {
        "domain": "www.linkedin.com",
        "hostOnly": true,
        "httpOnly": false,
        "name": "lil-lang",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": true,
        "storeId": null,
        "value": "en_US"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1781784184.515026,
        "hostOnly": false,
        "httpOnly": false,
        "name": "lms_analytics",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "AQEU3FlVrd4A3QAAAZ5AHjznjMjw0LILers4OcZI0hQ4LH1p14HF2PsjE7mSPJB_qP1mpg2BwolxxjZgonQDE9ytmYqoKtxf"
    },
    {
        "domain": ".linkedin.com",
        "hostOnly": false,
        "httpOnly": false,
        "name": "AMCVS_14215E3D5995C57C0A495C55%40AdobeOrg",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": true,
        "storeId": null,
        "value": "1"
    },
    {
        "domain": ".linkedin.com",
        "hostOnly": false,
        "httpOnly": true,
        "name": "fptctx2",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": true,
        "storeId": null,
        "value": "AQEfg%252fCJqa7RRdtvdsdqv6zDwtaNF9u%252b%252b1qvqbMqnTlOeHK2aKGYOoxvTIdkB0XrmRdYfTuOlAjVK3kENkUeotjdnKKZ%252bwmO0FOQkPdShkRl3iTBpC%252fGpR1Oyy0NMZjg3sZVCTdb4TKEBqPMkhE%252fyKJ838xsod7HU75cGFMe2IkTLxcvDlk3o7GX7pOcpzW3uSeK0%252fmzDyWCy6X7xhylteAJlVfrAlmF6cJAGYLRAAhHban5WEU7DRDYraGttMiuOxufn%252fJhO3Ko%252fW1fZIs3uqP8bWpiV1qDFJSNJ7uXc9pC2YmjPtd6t5zZlfZqwUTqOD7oTNUIYk92pMxFoJdoWUxoAUlqKKscthpUH8eC73z%252f07IGwsavdZ15VNLamSEu7kKj97ECOgt9S2dlUsSQAqA%252b"
    },
    {
        "domain": ".www.linkedin.com",
        "expirationDate": 1810811229.143172,
        "hostOnly": false,
        "httpOnly": true,
        "name": "li_at",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "AQEDARwo7P4FavOiAAABnkURZUAAAAGeaR3pQFYAzOBD7s2Ita4hg9mmGOQlaXYNFk7KyT2CGTH7I_XWwYemu6FykaJkBeOiwJRq0MfU4mpr2qlXJWOD8HNQilZjT1u1w-9o_1PhR6xKgdEy0-Jprbir"
    },
    {
        "domain": ".linkedin.com",
        "hostOnly": false,
        "httpOnly": false,
        "name": "lang",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": true,
        "storeId": null,
        "value": "v=2&lang=en-US"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1779428422.587291,
        "hostOnly": false,
        "httpOnly": false,
        "name": "lidc",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "\\\"b=OB58:s=O:r=O:a=O:p=O:g=3428:u=637:x=1:i=1779353578:t=1779428422:v=2:sig=AQF9vgKVb5DOBN-4GwuoG_3fOC0pjX4p\\\""
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1794884760,
        "hostOnly": false,
        "httpOnly": false,
        "name": "gpv_pn",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "www.linkedin.com%2Flearning%2Frole-play%2Finterview-prep%2Fid-redacted"
    },
    {
        "domain": ".linkedin.com",
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_sq",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": true,
        "storeId": null,
        "value": "%5B%5BB%5D%5D"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1781857662,
        "hostOnly": false,
        "httpOnly": false,
        "name": "aam_uuid",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "24835244172183657722235966372035641745"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1794817662,
        "hostOnly": false,
        "httpOnly": false,
        "name": "AMCV_14215E3D5995C57C0A495C55%40AdobeOrg",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "-637568504%7CMCIDTS%7C20594%7CMCMID%7C25018721205651851592290239483927704154%7CMCAAMLH-1779870462%7C12%7CMCAAMB-1779870462%7CRKhpRz8krg2tLO6pguXWp5olkAcUniQYPHaMWWgdJ3xzPWQmdj0y%7CMCOPTOUT-1779272862s%7CNONE%7CvVersion%7C5.1.1"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1781784184.013009,
        "hostOnly": false,
        "httpOnly": false,
        "name": "AnalyticsSyncHistory",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "AQI49Ueh7s8nSgAAAZ5AHjrtxvFIjWApd6mk8CamgypJ2W3QyFXsvUU06MF7Fd6l3WZouCaen6IHvM-3f3_J9g"
    },
    {
        "domain": ".www.linkedin.com",
        "expirationDate": 1810889575.837634,
        "hostOnly": false,
        "httpOnly": true,
        "name": "bscookie",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "\\\"v=1&20260414062712774ee70f-3369-4758-8031-2eb39d1a046bAQFAlZbvyyzLEb2F954LX7ILm8SNTfEK\\\""
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1807684059.581067,
        "hostOnly": false,
        "httpOnly": true,
        "name": "dfpfpt",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "3939721173e84c8e85a5b3df1f6e0025"
    },
    {
        "domain": ".www.linkedin.com",
        "expirationDate": 1787051229.143342,
        "hostOnly": false,
        "httpOnly": false,
        "name": "JSESSIONID",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "\\\"ajax:7329992990267429972\\\""
    },
    {
        "domain": ".www.linkedin.com",
        "expirationDate": 1810811229.14281,
        "hostOnly": false,
        "httpOnly": true,
        "name": "li_rm",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "AQH85YYhiNDt8wAAAZ2KrFgqAdkkp0Uc4gtdgoiQ20mbnA1pFiD1lKE-laPUuXrOd60Cj1bcciFVRPW8SGgcONGSXnUOzjCZ7jj_42AWTXV1J2qUjhO2nljWB2bCxbl28Bsptd0Ix9oKyXc9FlBwKQen-DoZM2TAdqSbooKdHwApQv_GKuT8u9o1DXFgojENQbxf2cf3iduNc4drd9UdHuixrFPnne_LmUe-98f3wACiT38VypAsyYKkSPB81hHbtErc_ZxfM9CINIEigWcqG9d3SfjAAqAXuO5xrM3AkTo18oONs05XhwTiV4QuCmkNF4is5AWQSpeF1pYK6lY0kQ"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1787129578.017049,
        "hostOnly": false,
        "httpOnly": false,
        "name": "li_sugr",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "5c872bf1-7fae-40a1-8c2b-fc3a8f2ee11a"
    },
    {
        "domain": ".www.linkedin.com",
        "expirationDate": 1794905576,
        "hostOnly": false,
        "httpOnly": false,
        "name": "li_theme",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "light"
    },
    {
        "domain": ".www.linkedin.com",
        "expirationDate": 1794905576,
        "hostOnly": false,
        "httpOnly": false,
        "name": "li_theme_set",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "app"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1787051229.143242,
        "hostOnly": false,
        "httpOnly": false,
        "name": "liap",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "true"
    },
    {
        "domain": "www.linkedin.com",
        "hostOnly": true,
        "httpOnly": false,
        "name": "PLAY_LANG",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": true,
        "storeId": null,
        "value": "en"
    },
    {
        "domain": "www.linkedin.com",
        "hostOnly": true,
        "httpOnly": true,
        "name": "PLAY_SESSION",
        "path": "/",
        "sameSite": "lax",
        "secure": true,
        "session": true,
        "storeId": null,
        "value": "eyJhbGciOiJIUzI1NiJ9.eyJkYXRhIjp7ImZsb3dUcmFja2luZ0lkIjoibkNHcTlQbjhSUDZLblN0TlRjeGRhZz09In0sIm5iZiI6MTc3OTI3NTUxNywiaWF0IjoxNzc5Mjc1NTE3fQ.PIYlA_wAqz_XYwU5q3mVMcrZsco_YusRfLIMq1aiKg8"
    },
    {
        "domain": ".linkedin.com",
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_cc",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": true,
        "storeId": null,
        "value": "true"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1794884760,
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_fid",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "003461536F81EC5E-174F7C5FB86A9AF3"
    },
    {
        "domain": ".linkedin.com",
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_plt",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": true,
        "storeId": null,
        "value": "1.80"
    },
    {
        "domain": ".linkedin.com",
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_pltp",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": true,
        "storeId": null,
        "value": "www.linkedin.com%2Flearning%2Frole-play%2Finterview-prep%2Fid-redacted"
    },
    {
        "domain": ".linkedin.com",
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_ppv",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": true,
        "storeId": null,
        "value": "www.linkedin.com%2Flearning%2Frole-play%2Finterview-prep%2Fid-redacted%2C85%2C85%2C730%2C1%2C1"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1794884760,
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_tp",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "863"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1794884760,
        "hostOnly": false,
        "httpOnly": false,
        "name": "s_tslv",
        "path": "/",
        "sameSite": null,
        "secure": false,
        "session": false,
        "storeId": null,
        "value": "1779332760656"
    },
    {
        "domain": ".www.linkedin.com",
        "expirationDate": 1780563176,
        "hostOnly": false,
        "httpOnly": false,
        "name": "timezone",
        "path": "/",
        "sameSite": null,
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "Asia/Calcutta"
    },
    {
        "domain": ".linkedin.com",
        "expirationDate": 1781784184.012941,
        "hostOnly": false,
        "httpOnly": false,
        "name": "UserMatchHistory",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "AQK__BIfK6PnGQAAAZ5AHjrtpJCQ9wyWNFV92_eBtl7tPLa1Z_0W5YLPTVV5oUXDZpDynTaC49NudQ"
    }
]`;
  let cookiesToInject = [];
  const trimmedSessionId = sessionId.trim();
  if (trimmedSessionId.startsWith("[") && trimmedSessionId.endsWith("]")) {
    const parsed = JSON.parse(trimmedSessionId);
    if (Array.isArray(parsed)) {
      cookiesToInject = parsed.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || ".linkedin.com",
        path: c.path || "/",
        secure: c.secure !== undefined ? c.secure : true,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite && c.sameSite.toLowerCase() !== 'no_restriction' ? c.sameSite : "None"
      }));
    }
  }
  
  console.log("Injecting cookies...");
  await ctx.addCookies(cookiesToInject);
  
  const page = await ctx.newPage();
  
  page.on("request", (req) => console.log("REQ:", req.url()));
  page.on("response", (res) =>  await ctx.clearCookies();
  
  console.log("Navigating...");
  const searchUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=AI&location=Dubai&f_TPR=r86400&start=0`;
  try {
    const response = await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log("Response:", response?.status());
  } catch (e) {
    console.log("Error:", e.message);
    const logs = e.message;
  }await browser.close();
}

test();

# Verify — Sodexo Kitchen Inspection PWA

## Build
```bash
npm run build   # vite build, ~10s
```

## Serve locally (MIME-correct static server)
```bash
node - << 'EOF' &
const http=require('http'),fs=require('fs'),path=require('path');
const DIST='/home/user/Claude/dist';
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
http.createServer((req,res)=>{
  let u=req.url.split('?')[0]; if(u.startsWith('/Claude'))u=u.slice('/Claude'.length)||'/';
  if(u==='/'||u==='')u='/index.html';
  try{const d=fs.readFileSync(path.join(DIST,u));res.writeHead(200,{'Content-Type':MIME[path.extname(u)]||'application/octet-stream'});res.end(d);}
  catch{const d=fs.readFileSync(path.join(DIST,'index.html'));res.writeHead(200,{'Content-Type':'text/html'});res.end(d);}
}).listen(5193,()=>console.log('up at http://localhost:5193/Claude/'));
EOF
```

## Browser (Playwright)
```
executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome
args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--no-zygote','--disable-dev-shm-usage']
```

## Caveats
- **Firebase auth**: Sign-in hits Firestore — not reachable in sandbox. Can't log in through the UI.
- Inject history via `addInitScript` + `localStorage.setItem('sdx_inspection_history', JSON.stringify([...]))`.
- All key changes to verify must be checked via **compiled bundle** (`dist/assets/R6hjECgu.js` — the largest JS file) since runtime auth is blocked.
- Bundle grep targets: `memo(function`, `useMemo`, `handSinkSubmitted`, `threeCompSinkSubmitted`, `sectionKey`.

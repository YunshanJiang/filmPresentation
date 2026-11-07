"""LAN presentation and optional Windows desktop mouse remote."""
import argparse, json, secrets, socket, threading, time, webbrowser, sys
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from desktop_control import DesktopControl

DESKTOP = DesktopControl()
ROOT = Path(__file__).resolve().parent
TOKEN = secrets.token_urlsafe(24)
LOCK = threading.Lock()
STATE = {'index': -1, 'busy': True, 'title': '等待电脑连接', 'phase': 'offline'}
OWNER = None
SEEN = 0
PENDING = None
SERIAL = 0
URLS = []

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(ROOT), **kw)
    def log_message(self, *a): pass
    def reply(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def auth(self):
        return secrets.compare_digest(self.headers.get('X-Remote-Key', ''), TOKEN)
    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith('/api/'):
            if not self.auth(): return self.reply({'error':'配对链接无效，请从电脑重新打开'},403)
            if path == '/api/desktop/frame':
                try:
                    content,meta=DESKTOP.capture(self.headers.get('X-Desktop-ID',''))
                    self.send_response(200);self.send_header('Content-Type','image/jpeg');self.send_header('Cache-Control','no-store')
                    self.send_header('X-Desktop-Meta',json.dumps(meta));self.send_header('Content-Length',str(len(content)))
                    self.end_headers();self.wfile.write(content)
                except PermissionError as e:self.reply({'error':str(e)},403)
                except (RuntimeError,OSError,ImportError) as e:self.reply({'error':str(e)},503)
                return
            with LOCK:
                if path == '/api/status': return self.reply({**STATE, 'online':time.monotonic()-SEEN<3, 'pending':PENDING is not None})
                if path == '/api/host':
                    client = self.headers.get('X-Host-ID')
                    if client != OWNER: return self.reply({'error':'请仅保留一个电脑演示窗口'},409)
                    return self.reply({'command':PENDING, 'urls':URLS})
            return self.reply({'error':'not found'},404)
        # Byte ranges preserve fast seeking / reverse-video playback.
        file = Path(self.translate_path(self.path))
        header = self.headers.get('Range','')
        if file.is_file() and header.startswith('bytes='):
            try:
                a,z = header[6:].split('-',1); size=file.stat().st_size
                start=int(a) if a else max(0,size-int(z)); end=min(int(z) if z and a else size-1,size-1)
                if start<0 or start>end: raise ValueError()
                self.send_response(206);self.send_header('Content-Type',self.guess_type(str(file)))
                self.send_header('Content-Range',f'bytes {start}-{end}/{size}');self.send_header('Accept-Ranges','bytes')
                self.send_header('Content-Length',str(end-start+1));self.end_headers()
                with file.open('rb') as f:
                    f.seek(start);remaining=end-start+1
                    while remaining:
                        chunk=f.read(min(65536,remaining));self.wfile.write(chunk);remaining-=len(chunk)
                return
            except (ValueError, OSError): self.send_error(416);return
        super().do_GET()
    def do_POST(self):
        global OWNER,SEEN,STATE,PENDING,SERIAL
        if not self.auth(): return self.reply({'error':'配对链接无效'},403)
        try:
            length=int(self.headers.get('Content-Length',0))
            if not 0<length<4096: raise ValueError()
            data=json.loads(self.rfile.read(length))
        except (ValueError,TypeError):return self.reply({'error':'bad request'},400)
        if self.path.startswith('/api/desktop/'):
            try:
                client=self.headers.get('X-Desktop-ID','')
                if self.path=='/api/desktop/enable':result=DESKTOP.enable(client)
                elif self.path=='/api/desktop/disable':result=DESKTOP.disable(client)
                elif self.path=='/api/desktop/input':result=DESKTOP.input(client,data)
                else:return self.reply({'error':'not found'},404)
                return self.reply(result)
            except PermissionError as e:return self.reply({'error':str(e)},403)
            except (ValueError,TypeError) as e:return self.reply({'error':str(e)},400)
            except (RuntimeError,OSError,ImportError) as e:return self.reply({'error':str(e)+'；请确认已安装 Pillow'},503)
        with LOCK:
            if self.path == '/api/state':
                client=self.headers.get('X-Host-ID')
                if not client or (OWNER and OWNER!=client and time.monotonic()-SEEN<3):return self.reply({'error':'已有电脑演示窗口连接'},409)
                OWNER=client;SEEN=time.monotonic()
                STATE={k:data.get(k) for k in ('index','busy','title','phase','token','muted','caseIndex','clip','time','paused','planeVisible','brush')}
                if PENDING and data.get('ack')==PENDING['id']: PENDING=None
                return self.reply({'ok':True})
            if self.path == '/api/command':
                action=data.get('action');index=STATE['index']
                if action not in ('next','previous','replay','navigate','case-open','case-close','sound'):return self.reply({'error':'invalid action'},400)
                if time.monotonic()-SEEN>=3:return self.reply({'error':'电脑未连接'},409)
                if STATE['busy'] or PENDING:return self.reply({'error':'转场中，请稍候'},409)
                if (action=='previous' and index<=0) or (action=='next' and index>=9) or (action=='replay' and index<0):return self.reply({'error':'已到边界页'},409)
                target=data.get('target')
                if action=='navigate' and (type(target) is not int or not 0<=target<=9):return self.reply({'error':'无效章节'},400)
                if action=='case-open' and (index!=2 or type(target) is not int or not 0<=target<=3):return self.reply({'error':'无效案例'},400)
                SERIAL+=1;PENDING={'id':SERIAL,'action':action,'target':target,'index':index,'expires':time.time()+3}
                return self.reply({'ok':True,'id':SERIAL})
        self.reply({'error':'not found'},404)

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8769);parser.add_argument('--no-open',action='store_true');args=parser.parse_args()
    server=ThreadingHTTPServer(('0.0.0.0',args.port),Handler)
    ips=set(socket.gethostbyname_ex(socket.gethostname())[2])
    try:
        with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:
            s.connect(('192.0.2.1',80));ips.add(s.getsockname()[0])
    except OSError:pass
    URLS.extend(f'http://{ip}:{args.port}/remote.html#key={TOKEN}' for ip in sorted(ips) if not ip.startswith('127.'))
    host=f'http://127.0.0.1:{args.port}/film.html#key={TOKEN}'
    print('电脑演示：'+host,flush=True)
    for url in URLS:print('手机遥控：'+url,flush=True)
    print('电脑和手机连接同一 Wi-Fi。保持此窗口运行；Ctrl+C 关闭。',flush=True)
    if not args.no_open:webbrowser.open(host)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:DESKTOP.close();server.server_close()
if __name__=='__main__':main()

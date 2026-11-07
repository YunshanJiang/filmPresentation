"""Authenticated LAN desktop capture/input. Screenshots stay in memory."""
import ctypes
from ctypes import wintypes
import io
import math
import sys
import threading
import time


class WindowsDesktop:
    def __init__(self):
        if sys.platform != 'win32':
            raise RuntimeError('鼠标模式目前支持 Windows 电脑')
        from PIL import ImageGrab, ImageDraw
        self.grab, self.draw = ImageGrab.grab, ImageDraw.Draw
        self.user = ctypes.WinDLL('user32', use_last_error=True)
        try:
            self.user.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        except AttributeError:
            self.user.SetProcessDPIAware()
        self.user.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
        self.user.SetCursorPos.restype = wintypes.BOOL

        class MouseInput(ctypes.Structure):
            _fields_ = [('dx', wintypes.LONG), ('dy', wintypes.LONG),
                        ('mouseData', wintypes.DWORD), ('dwFlags', wintypes.DWORD),
                        ('time', wintypes.DWORD), ('extra', ctypes.c_size_t)]
        class Payload(ctypes.Union):
            _fields_ = [('mi', MouseInput)]
        class Input(ctypes.Structure):
            _anonymous_ = ('payload',)
            _fields_ = [('type', wintypes.DWORD), ('payload', Payload)]
        self.Input, self.MouseInput = Input, MouseInput
        self.user.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(Input), ctypes.c_int]
        self.user.SendInput.restype = wintypes.UINT

    def stopped(self):
        return bool(self.user.GetAsyncKeyState(0x1B) & 0x8000)

    def bounds(self):
        return tuple(self.user.GetSystemMetrics(n) for n in (76, 77, 78, 79))

    def capture(self):
        image = self.grab(all_screens=True).convert('RGB')
        x, y, w, h = self.bounds()
        if image.size != (w, h):
            raise RuntimeError('屏幕缩放发生变化，请重新开启鼠标模式')
        point = wintypes.POINT()
        if not self.user.GetCursorPos(ctypes.byref(point)):
            raise ctypes.WinError(ctypes.get_last_error())
        image.thumbnail((1600, 1000))
        cx, cy = (point.x-x)*image.width/w, (point.y-y)*image.height/h
        pen = self.draw(image)
        pen.ellipse((cx-9, cy-9, cx+9, cy+9), fill='#ffc84e', outline='#251535', width=3)
        pen.line((cx-15, cy, cx+15, cy), fill='#ffc84e', width=2)
        pen.line((cx, cy-15, cx, cy+15), fill='#ffc84e', width=2)
        output = io.BytesIO()
        image.save(output, format='JPEG', quality=72)
        return output.getvalue(), {'bounds':[x,y,w,h], 'width':image.width, 'height':image.height,
                                   'cursor':[(point.x-x)/w, (point.y-y)/h]}

    def move(self, x, y):
        if not self.user.SetCursorPos(x, y):
            raise ctypes.WinError(ctypes.get_last_error())

    def mouse(self, flag, data=0):
        value = self.Input(type=0)
        value.mi = self.MouseInput(0, 0, data & 0xffffffff, flag, 0, 0)
        if self.user.SendInput(1, ctypes.byref(value), ctypes.sizeof(value)) != 1:
            raise RuntimeError('系统未接受鼠标输入，请勿操作管理员权限窗口')


class DesktopControl:
    def __init__(self, backend=None, watchdog=True):
        self.backend = backend
        self.lock = threading.RLock()
        self.owner = None
        self.seen = 0
        self.held = False
        self.frames = {}
        self.serial = 0
        self.last_seq = 0
        self.closed = threading.Event()
        if watchdog:
            threading.Thread(target=self._watch, daemon=True).start()

    def _watch(self):
        while not self.closed.wait(.15):
            with self.lock:
                if self.owner and (time.monotonic()-self.seen>3 or self.backend.stopped()):
                    self._release()

    def _release(self):
        if self.held:
            try: self.backend.mouse(0x0004)
            finally: self.held = False
        self.owner = None
        self.frames.clear()

    def close(self):
        self.closed.set()
        with self.lock: self._release()

    def _check(self, client):
        if not self.owner or self.owner != client or time.monotonic()-self.seen>3:
            raise PermissionError('鼠标模式已停止，请重新开启')
        if self.backend.stopped():
            self._release()
            raise PermissionError('电脑已按 Esc 停止鼠标控制')
        self.seen = time.monotonic()

    def enable(self, client):
        if not client or len(client)>128: raise ValueError('无效控制端')
        with self.lock:
            if self.owner and self.owner!=client and time.monotonic()-self.seen<3:
                raise PermissionError('另一台手机正在控制鼠标')
            if self.backend is None: self.backend = WindowsDesktop()
            self._release()
            self.owner, self.seen, self.last_seq = client, time.monotonic(), 0
        return {'ok':True}

    def disable(self, client):
        with self.lock:
            if self.owner == client: self._release()
        return {'ok':True}

    def capture(self, client):
        with self.lock:
            self._check(client)
            content, meta = self.backend.capture()
            self.serial += 1
            meta['frame'] = self.serial
            self.frames[self.serial] = (time.monotonic(), meta['bounds'])
            self.frames = {k:v for k,v in self.frames.items() if time.monotonic()-v[0]<2}
            return content, meta

    def input(self, client, data):
        with self.lock:
            self._check(client)
            action = data.get('action')
            if action not in ('move','click','right','down','up','wheel'):
                raise ValueError('无效鼠标动作')
            seq = data.get('seq')
            if type(seq) is not int or seq<=self.last_seq: raise ValueError('已忽略过期鼠标指令')
            if action == 'up':
                if self.held: self.backend.mouse(0x0004); self.held=False
                self.last_seq=seq
                return {'ok':True}
            frame = self.frames.get(data.get('frame'))
            if not frame or time.monotonic()-frame[0]>2:
                raise ValueError('画面已过期，等待更新后再操作')
            x,y = data.get('x'),data.get('y')
            if any(type(n) not in (int,float) or not math.isfinite(n) or not 0<=n<=1 for n in (x,y)):
                raise ValueError('鼠标坐标越界')
            left,top,width,height = frame[1]
            if tuple(frame[1]) != tuple(self.backend.bounds()):
                raise ValueError('显示器布局发生变化，请等待新画面')
            delta=data.get('delta',0)
            if action=='wheel' and (type(delta) not in (int,float) or not math.isfinite(delta) or abs(delta)>1200):
                raise ValueError('无效滚动距离')
            self.backend.move(left+round(x*(width-1)),top+round(y*(height-1)))
            if action in ('click','right'):
                down,up=(0x0002,0x0004) if action=='click' else (0x0008,0x0010)
                self.backend.mouse(down)
                self.backend.mouse(up)
            elif action=='down' and not self.held:
                self.backend.mouse(0x0002);self.held=True
            elif action=='wheel': self.backend.mouse(0x0800, -round(delta))
            self.last_seq=seq
            return {'ok':True}

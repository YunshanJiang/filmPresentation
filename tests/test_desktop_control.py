import sys
from pathlib import Path
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from desktop_control import DesktopControl


class FakeDesktop:
    def __init__(self): self.events=[];self.escape=False;self.rect=(-1920,0,3840,1080)
    def stopped(self): return self.escape
    def bounds(self): return self.rect
    def capture(self): return b'jpeg', {'bounds':list(self.rect),'width':1600,'height':450,'cursor':[.5,.5]}
    def move(self,x,y): self.events.append(('move',x,y))
    def mouse(self,flag,data=0): self.events.append(('mouse',flag,data))


class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.backend=FakeDesktop();self.control=DesktopControl(self.backend,watchdog=False)
        self.control.enable('phone');_,self.meta=self.control.capture('phone')
    def tearDown(self): self.control.close()
    def command(self,action,seq=1,**kw):
        return self.control.input('phone',{'action':action,'seq':seq,'frame':self.meta['frame'],'x':.25,'y':.5,**kw})
    def test_negative_monitor_origin_and_click(self):
        self.command('click')
        self.assertEqual(self.backend.events,[('move',-960,540),('mouse',2,0),('mouse',4,0)])
    def test_no_capture_without_lease(self):
        with self.assertRaises(PermissionError):self.control.capture('stranger')
    def test_another_phone_cannot_take_over(self):
        with self.assertRaises(PermissionError):self.control.enable('other')
    def test_coordinates_invalid_or_nonfinite(self):
        for value in (-.1,1.1,float('nan'),float('inf'),True,None):
            with self.assertRaises(ValueError):self.command('click',x=value)
        self.assertEqual(self.backend.events,[])
    def test_stale_or_duplicate_input_is_rejected(self):
        self.command('move')
        with self.assertRaises(ValueError):self.command('click')
        with patch('desktop_control.time.monotonic',return_value=self.control.seen+2.1):
            with self.assertRaises(ValueError):self.command('click',2)
    def test_drag_release_works_after_frame_expiry(self):
        self.command('down')
        with patch('desktop_control.time.monotonic',return_value=self.control.seen+2.1):self.command('up',2)
        self.assertFalse(self.control.held)
        self.assertEqual(self.backend.events[-1],('mouse',4,0))
    def test_escape_stops_and_releases_drag(self):
        self.command('down');self.backend.escape=True
        with self.assertRaises(PermissionError):self.command('move',2)
        self.assertFalse(self.control.held);self.assertIsNone(self.control.owner)
    def test_disable_releases_mouse(self):
        self.command('down');self.control.disable('phone')
        self.assertEqual(self.backend.events[-1],('mouse',4,0))
    def test_wheel_direction_and_limits(self):
        self.command('wheel',delta=120)
        self.assertEqual(self.backend.events[-1],('mouse',0x0800,-120))
        with self.assertRaises(ValueError):self.command('wheel',2,delta=2000)
    def test_monitor_change_invalidates_coordinates(self):
        self.backend.rect=(0,0,1920,1080)
        with self.assertRaises(ValueError):self.command('click')
        self.assertEqual(self.backend.events,[])


if __name__=='__main__':unittest.main()

@echo off
chcp 65001 >nul
cd /d "%~dp0"
py -c "import PIL" >nul 2>&1
if errorlevel 1 (
  echo 正在安装鼠标模式所需的 Pillow...
  py -m pip install -r requirements.txt
  if errorlevel 1 (
    echo Pillow 安装失败，普通翻页仍可使用，鼠标模式暂不可用。
  )
)
py remote-server.py
pause

import Blackprint.ModuleLoader
from aiohttp import web
import asyncio
import socketio
import BlackprintRC
import Blackprint
import datetime

import os
ignore_directory = { 'Blender' }
Blackprint.ModuleLoader.add_path_hot_reload(os.path.dirname(__file__) + '/BPNode', lambda path: remote.notifyPuppetNodeListReload({'file': path}), ignore_directory)

instance = Blackprint.Engine()
remote = BlackprintRC.RemoteEngine(instance)

def moduleAdd(ev):
	print(f"Adding {ev.list.length} new module, triggered by remote sync")
remote.on('module.add', moduleAdd)

def moduleAdded(ev):
	print(f"{ev.list.length} new module has been added")

	if(ev.failed.length != 0):
		print(f"Failed to add {ev.failed.length} new module")
remote.on('module.added', moduleAdded)

def moduleRemove(ev):
	print(f"{ev.list.length} module has been removed, triggered by remote sync")
remote.on('module.remove', moduleRemove)

remote.on('disabled', lambda: print('Due to some reason, remote control was disabled'))

# Allow import/module sync (return true = allow, false = disable sync)
remote.onImport = lambda: print("Remote import is allowed") or True
remote.onModule = lambda: print("Remote module is allowed") or True



#  ========= Socket.IO =========

sio = socketio.AsyncServer(cors_allowed_origins='*')
app = web.Application()
sio.attach(app)

engineStartup = int(datetime.datetime.now().timestamp()*1000)
loop = None

@sio.event
async def connect(sid, environ):
	global loop
	if(loop == None): loop = asyncio.get_running_loop()

	remote.onSyncOut = lambda data: asyncio.run_coroutine_threadsafe(sio.emit('relay', data, room=sid), loop)
	await sio.emit('startup-time', engineStartup, room=sid)
	remote.notifyPuppetNodeListReload()
	print('Remote control: connected', sid)

@sio.event
async def relay(sid, data):
	try:
		remote.onSyncIn(data)
	except Exception as e:
		import traceback
		traceback.print_exception(type(e), e, e.__traceback__)

@sio.event
def disconnect(sid):
	print('Remote control: disconnected', sid)

async def index(request):
	return web.Response(text="You need to access this engine from Blackprint Editor", content_type='text/html')

app.router.add_get('/', index)

if __name__ == '__main__':
	web.run_app(app, host="localhost", port=2345)
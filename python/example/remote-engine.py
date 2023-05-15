from aiohttp import web
import asyncio
import socketio
import BlackprintRC
import Blackprint
import datetime

# Download from https://github.com/Blackprint/engine-python/tree/main/example/BPNode
import BPNode # Register our nodes from BPNode folder

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

engineStartup = int(datetime.datetime.utcnow().timestamp()*1000)
loop = None

@sio.event
async def connect(sid, environ):
	global loop
	if(loop == None): loop = asyncio.get_running_loop()

	remote.onSyncOut = lambda data: loop.create_task(sio.emit('relay', data, room=sid))
	await sio.emit('startup-time', engineStartup, room=sid)
	print('Remote control: connected', sid)

@sio.event
async def relay(sid, data):
	remote.onSyncIn(data)

@sio.on('puppetnode.ask')
async def puppetNodeAsk(sid):
	await sio.emit('puppetnode.answer', BlackprintRC.PuppetNode.getRegisteredNodes(), room=sid)

@sio.event
def disconnect(sid):
	print('Remote control: disconnected', sid)

async def index(request):
	return web.Response(text="You need to access this engine from Blackprint Editor", content_type='text/html')

app.router.add_get('/', index)

if __name__ == '__main__':
	web.run_app(app, host="localhost", port=2345)
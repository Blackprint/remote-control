Blackprint.space.model('remote-sketch', function(My){
	My.remotes = [];
});

function initContainer(instance) {
	let spaceEl = instance.scope.domList[0];
	let scope = instance.scope('remote-sketch');

	// This must be template only, don't insert dynamic data with ${...}
	spaceEl.querySelector('sf-m[name="container"]').insertAdjacentHTML('beforeEnd', `<sf-m name="remote-sketch">
		<div class="cursor" sf-each="val in remotes" style="transform: translate({{ val.x }}px, {{ val.y }}px)">
			<i class="fa fa-mouse-pointer"></i>
			<span>{{ val.uid }}</span>
		</div>
	</sf-m>
	<style>
		sf-m[name="remote-sketch"] {
			pointer-events: none;
			color: white;
			top: 0;
			position: absolute;
		}
		sf-m[name="remote-sketch"] .cursor {
			transition: 0.1s ease-in-out transform;
		}
		sf-m[name="remote-sketch"] span {
			vertical-align: bottom;
			background: #37b0219e;
			padding: 5px 8px;
			font-size: 12px;
			border-radius: 10px;
		}
	</style>`);
	return scope;
}

class RemoteSketch extends RemoteEngineClient {
	constructor(instance){
		super(instance);
		Blackprint.settings('_remoteSketch', true);

		this._scope = initContainer(instance);
		this.isSketch = true;
		let { ifaceList } = instance;

		let that = this;
		let uid = Math.random()*10000 | 0; // ToDo: replace this on the relay server

		function keyup(ev){
			if(that._skipEvent || !ev.isTrusted) return;
			let tagName = ev.target.tagName;

			if(tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'){
				let el = ev.target.closest('.nodes .node');
				if(el.model == null) return;

				let s = getElementSelector(ev.target, el);
				let i = ifaceList.indexOf(el.model);
				that._onSyncOut({uid, w:'skc', t:'kd', s, i, fd: ev.target.value});
			}
		}

		let container = this.instance.scope('container');
		function pointerdown(ev){
			if(that._skipEvent || !ev.isTrusted) return;
			let node = ev.target.closest('.nodes .node');
			let cable = ev.target.closest('.cables g');

			if(node != null){
				let i = ifaceList.indexOf(node.model);
				that._onSyncOut({uid, t:'skc', w:'npd', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y, i});
			}
			else if(cable != null){
				cable = cable.model;
				let ci = container.cableScope.list.indexOf(cable);

				that._onSyncOut({uid, t:'skc', w:'cpd',
				    x:ev.clientX-container.pos.x,
				    y:ev.clientY-container.pos.y,
					ci,
				});
			}
			else {
				if(instance.scope('container').select.show){ // selecting
					that._onSyncOut({uid, t:'skc', w:'selpd', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y});
				}
			}
		}

		let lastTimestamp = 0;
		let lastMoveEv;
		function pointermove(ev){
			if(!ev.isTrusted) return;
			if(that._skipEvent || (ev.timeStamp-lastTimestamp) < 100){
				lastMoveEv = ev;

				setTimeout(()=> {
					if(lastMoveEv == null) return;

					lastTimestamp = ev.timeStamp;
					pointermove(lastMoveEv);
				}, 100);
				return;
			}

			lastMoveEv = null;

			lastTimestamp = ev.timeStamp;
			that._onSyncOut({uid, w:'skc', t:'pm', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y});
		}

		$(window)
			.on('keyup', keyup)
			.on('pointerdown', pointerdown)
			.on('pointermove', pointermove);

		this.destroy = function(){
			$(window)
				.off('keyup', keyup)
				.off('pointerdown', pointerdown)
				.off('pointermove', pointermove);
		}
	}

	onSyncIn(data){
		data = super.onSyncIn(data);
		if(data == null) return;

		if(data.t === 'kd'){
			let { ifaceList } = this.instance;
			let iface = ifaceList[data.i];
			let el = elementChildIndexes(data.s, iface.$el[0].children[0]);

			el.value = data.fd;
			$(el).trigger('input');
			return;
		}

		if(data.t === 'skc'){
			if(data.w === 'npd'){
				// c
			}
			else if(data.w === 'cpd'){
				// c
			}
			else if(data.w === 'selpd'){
				// c
			}
			return;
		}

		let { remotes } = this._scope;
		let cursor;

		for (var i = 0; i < remotes.length; i++) {
			if(remotes[i].uid === data.uid){
				cursor = remotes[i];
				break
			}
		}

		if(cursor == null){
			cursor = { uid: data.uid };
			remotes.push(cursor);
		}

		let container = this.instance.scope('container');

		cursor.x = data.x - container.offset.x;
		cursor.y = data.y - container.offset.y;

		if(data.t === 'pd'){}
		else if(data.t === 'pm'){}
	}
}

Blackprint.RemoteSketch = RemoteSketch;

/*
let ins = new Blackprint.RemoteSketch(SketchList[0]);
ins.onSyncOut = v => ins.onSyncIn(v);
 */

/*
let win = window.open('https://output.jsbin.com/lijirat', 'ay', 'popup')
window.onmessage = console.log;
ins.onSyncOut = v => ins.onSyncIn(v);

---
let win = window.open('http://localhost:6789/dev.html#page/sketch/1', 'ay', 'popup');

win.onclick = function(){
	win.onclick = null;
	win.ins = new win.Blackprint.RemoteSketch(win.SketchList[0]);
	win.onmessage = function(msg){ win.ins.onSyncIn(msg.data) };
	win.ins.onSyncOut = v => win.opener.postMessage(v);

	let ins = new Blackprint.RemoteSketch(SketchList[0]);
	window.onmessage = function(msg){ ins.onSyncIn(msg.data) };
	ins.onSyncOut = v => win.postMessage(v);
}
 */
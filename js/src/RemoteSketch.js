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
		let $window = $(window);
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
			if(that._skipEvent || !ev.isTrusted || ev.button !== 0) return;
			let node = ev.target.closest('.nodes .node');
			let cable = ev.target.closest('.cables g');

			if(node != null){
				let iface = node.model;
				let i = ifaceList.indexOf(node.model);

				that._onSyncOut({uid, w:'skc', t:'npd', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y, i});

				$window.once('pointerup', () => {
					that._onSyncOut({uid, w:'skc', t:'npu', x:iface.x, y:iface.y, i});
				}, {capture: true});
			}
			else if(cable != null){
				cable = cable.model;
				let ci = container.cableScope.list.indexOf(cable);

				that._onSyncOut({uid, w:'skc', t:'cpd',
				    x:ev.clientX-container.pos.x,
				    y:ev.clientY-container.pos.y,
					ci,
				});

				$window.once('pointerup', () => {
					that._onSyncOut({uid, w:'skc', t:'cpu',
					    x:cable.head2[0],
					    y:cable.head2[1],
						ci,
					});
				}, {capture: true});
			}
			else {
				if(container.select.show){ // selecting
					that._onSyncOut({uid, w:'skc', t:'selpd', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y});

					$window.once('pointerup', () => {
						that._onSyncOut({uid, w:'skc', t:'selpu', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y});
					}, {capture: true});
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

		$window
			.on('keyup', keyup, {capture: true})
			.on('pointerdown', pointerdown, {capture: true})
			.on('pointermove', pointermove, {capture: true});

		instance.on('cable.created', cableCreated);
		function cableCreated({ port, cable }){
			that._onSyncOut({uid, w:'skc', t:'ccd'});

			$window.once('pointerup', () => {
				if(cable._evDisconnected) return;

				let list = container.cableScope.list;
				let ci = list.indexOf(cable);

				that._onSyncOut({uid, w:'skc', t:'ccu', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y, ci});
			}, {capture: true});
		}

		instance.on('cable.created.branch', cableCreatedBranch);
		function cableCreatedBranch({ cable }){
			let list = container.cableScope.list;

			let pci = list.indexOf(cable.parentCable);
			that._onSyncOut({uid, w:'skc', t:'ccbd', pci});

			$window.once('pointerup', () => {
				if(cable._evDisconnected) return;
				let ci = list.indexOf(cable);

				that._onSyncOut({uid, w:'skc', t:'ccbu', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y, pci, ci});
			}, {capture: true});
		}

		instance.on('cable.deleted', cableDeleted);
		function cableDeleted({ cable }){
			let list = container.cableScope.list;
			let ci = list.indexOf(cable);

			cable._evDisconnected = true;
			that._onSyncOut({uid, w:'skc', t:'cd', ci});
		}

		this.destroy = function(){
			$window
				.off('keyup', keyup, {capture: true})
				.off('pointerdown', pointerdown, {capture: true})
				.off('pointermove', pointermove, {capture: true});

			instance.off('cable.created', cableCreated);
			instance.off('cable.deleted', cableDeleted);
		}
	}

	onSyncIn(data){
		data = super.onSyncIn(data);
		if(data == null) return;
		if(window.aaa) console.log(data);

		if(data.w === 'kd'){ // keydown
			let { ifaceList } = this.instance;
			let iface = ifaceList[data.i];
			let el = elementChildIndexes(data.s, iface.$el[0].children[0]);

			el.value = data.fd;
			$(el).trigger('input');
			return;
		}

		if(data.w === 'skc'){ // sketch event
			if(data.t === 'selpd'){ // selection pointer down
				// ToDo
			}
			else if(data.t === 'selpu'){ // selection pointer up
				// ToDo
			}
			else if(data.t.slice(0, 1) === 'n'){ // node
				let container = this.instance.scope('container');
				let { ifaceList } = this.instance;
				let iface;

				if(data.i != null){
					iface = ifaceList[data.i];
					if(iface == null) throw new Error("Node list was not synced");
				}

				if(data.t === 'npd'){ // node pointer down
					// ToDo
				}
				else if(data.t === 'npu'){ // node pointer up
					iface.x = data.x;
					iface.y = data.y;
				}
			}
			else if(data.t.slice(0, 1) === 'c'){ // cable
				let container = this.instance.scope('container');
				let cables = container.cableScope;
				let cable, parentCable;

				if(data.ci != null){
					cable = cables.list[data.ci];
					if(cable == null) throw new Error("Cable list was not synced");
				}

				if(data.pci != null){
					parentCable = cables.list[data.pci];
					if(parentCable == null) throw new Error("Cable list was not synced");
				}

				if(data.t === 'cpd'){ // cable pointer down
					// ToDo
				}
				else if(data.t === 'cpu'){ // cable pointer up
					cable.head2[0] = data.x;
					cable.head2[1] = data.y;
				}

				else if(data.t === 'ccd'){ // cable created down
					// ToDo
				}
				else if(data.t === 'ccu'){ // cable created up
					cable.head2[0] = data.x;
					cable.head2[1] = data.y;
				}

				else if(data.t === 'ccbd'){ // cable created branch down
					this._skipEvent = true;
					cable.createBranch();
					this._skipEvent = false;
				}
				else if(data.t === 'ccbu'){ // cable created branch up
					cable.head2[0] = data.x;
					cable.head2[1] = data.y;
				}

				else if(data.t === 'cd'){ // cable deleted
					this._skipEvent = true;
					cable.disconnect();
					this._skipEvent = false;
				}
			}
			else if(data.t.slice(0, 1) === 'p'){ // pointer
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

				if(data.t === 'pd'){ // pointer down
					// ToDo
				}
				else if(data.t === 'pm'){ // pointer move
					// ToDo
				}
			}
			else throw new Error("Unhandled sketch control: "+ data.t);
		}
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
	window.onbeforeunload = ()=> win.close();
	ins.onSyncOut = v => win.postMessage(v);
}
 */
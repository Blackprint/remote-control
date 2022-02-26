function initContainer(instance) {
	let spaceEl = instance.scope.domList[0];

	// This must be template only, don't insert dynamic data with ${...}
	spaceEl.querySelector('sf-m[name="container"]').insertAdjacentHTML('beforeEnd', `<sf-m name="remote-sketch">
		<div class="cursor" sf-each="val in remotes" style="transform: translate3d({{ val.x }}px, {{ val.y }}px, 0px)">
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
			transition: 0.1s ease-out transform;
			will-change: transform;
			backface-visibility: hidden;
		}
		sf-m[name="remote-sketch"] span {
			vertical-align: bottom;
			background: #37b0219e;
			padding: 5px 8px;
			font-size: 12px;
			border-radius: 10px;
		}
	</style>`);

	return instance.scope('remote-sketch');
}

if(globalThis.sf != null){
	sf.$(function(){
		Blackprint.space.model('remote-sketch', function(My){
			My.remotes = [];
		});
	});
}

class RemoteSketch extends RemoteControl {
	constructor(instance){
		super(instance);
		this.isSketch = true;
		Blackprint.settings('_remoteSketch', true);

		this._scope = initContainer(instance);
		instance._remote = this;

		let { ifaceList } = instance;

		let that = this;
		let $window = $(window);
		let uid = Math.random()*10000 | 0; // ToDo: replace this on the relay server

		function keyup(ev){
			if(that._skipEvent || !ev.isTrusted) return;
			let tagName = ev.target.tagName;

			if(tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'){
				let el = ev.target.closest('.nodes .node');
				if(el == null || el.model == null) return;

				let s = getElementSelector(ev.target, el);
				let i = ifaceList.indexOf(el.model);
				that._onSyncOut({uid, w:'skc', t:'kd', s, i, fd: ev.target.value});
			}
		}

		let container = this.instance.scope('container');
		function getSelectedIDs(){
			let {cableScope, nodeScope} = container;
			let cSelected = cableScope.selected;
			let nSelected = nodeScope.selected;

			let sc = [];
			for (var i = 0; i < cSelected.length; i++)
				sc.push(cableScope.list.indexOf(cSelected[i]));

			let sn = [];
			for (var i = 0; i < nSelected.length; i++)
				sn.push(nodeScope.list.indexOf(nSelected[i]));

			return {sc, sn};
		}

		let npu, cpu, selpu;
		function pointerdown(ev){
			if(that._skipEvent || !ev.isTrusted || ev.button !== 0) return;
			let node = ev.target.closest('.nodes .node');
			let cable = ev.target.closest('.cables g');

			if(node != null){
				let iface = node.model;
				let i = ifaceList.indexOf(node.model);

				that._onSyncOut({uid, w:'skc', t:'npd', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y, i});

				npu = true;
				$window.once('pointerup', () => {
					if(npu === false) return;
					let {sn, sc} = getSelectedIDs();
					that._onSyncOut({uid, w:'skc', t:'npu', x:iface.x, y:iface.y, i,
						sn, sc
					});
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

				cpu = true;
				$window.once('pointerup', () => {
					if(cpu === false) return;
					let {sn, sc} = getSelectedIDs();
					that._onSyncOut({uid, w:'skc', t:'cpu', ci, sn, sc,
					    x:cable.head2[0], y:cable.head2[1],
					});
				}, {capture: true});
			}
			else {
				if(container.select.show){ // selecting
					that._onSyncOut({uid, w:'skc', t:'selpd', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y});

					selpu = true;
					$window.once('pointerup', () => {
						if(selpu === false) return;
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
			if(that._skipEvent) return;
			let i = ifaceList.indexOf(port.iface);

			that._onSyncOut({uid, w:'skc', t:'ccd', i, n: port.name, s: port.source});

			cpu = false;
			$window.once('pointerup', (event) => {
				if(cable._evDisconnected) return;

				let list = container.cableScope.list;
				let ci = list.indexOf(cable);

				that._onSyncOut({uid, w:'skc', t:'ccu', x:cable.head2[0], y:cable.head2[1], ci});
			}, {capture: true});
		}

		instance.on('cable.create.branch', cableCreatedBranch);
		function cableCreatedBranch(ev){
			if(that._skipEvent) return;
			let { event, cable, type } = ev; // Don't destructure newCable
			let list = container.cableScope.list;
			let ty = type === 'cablePath' ? 0 : 1;

			let ci = list.indexOf(cable);
			that._onSyncOut({uid, w:'skc', t:'ccbd', ci, ty,
			    x:event.clientX - container.pos.x,
			    y:event.clientY - container.pos.y,
			});

			cpu = false;
			$window.once('pointerup', (event) => {
				if(cable._evDisconnected) return;
				let ci = list.indexOf(cable);
				let nci = list.indexOf(ev.newCable);

				that._onSyncOut({uid, w:'skc', t:'ccbu', ci, nci, ty,
				    x:event.clientX - container.pos.x,
				    y:event.clientY - container.pos.y,
				});
			}, {capture: true});
		}

		instance.on('cable.deleted', cableDeleted);
		function cableDeleted({ cable }){
			if(that._skipEvent) return;
			let list = container.cableScope.list;
			let ci = list.indexOf(cable);

			cable._evDisconnected = true;
			that._onSyncOut({uid, w:'skc', t:'cd', ci});
		}

		instance.on('node.id.changed', nodeIDChanged);
		function nodeIDChanged({ iface, from, to }){
			if(that._skipEvent) return;

			let i = ifaceList.indexOf(iface);
			that._onSyncOut({uid, w:'ins', t:'nidc', i, f:from, to:to});
		}

		this.destroy = function(){
			$window
				.off('keyup', keyup, {capture: true})
				.off('pointerdown', pointerdown, {capture: true})
				.off('pointermove', pointermove, {capture: true});

			instance.off('cable.create.branch', cableCreatedBranch);
			instance.off('cable.created', cableCreated);
			instance.off('cable.deleted', cableDeleted);
			instance.off('node.id.changed', nodeIDChanged);

			this.onSyncIn = ()=>{};
			this.onSyncOut = ()=>{};
		}
	}

	_applySelectedId(container, data){
		let {sc, sn} = data;
		if(sc.length === 0 && sn.length === 0) return;

		let {cableScope, nodeScope} = container;
		this._clearSelectedId(container);

		for (var i = 0; i < sc.length; i++)
			sc[i] = cableScope.list[sc[i]];

		cableScope.selected.push(...sc);

		for (var i = 0; i < sn.length; i++)
			sn[i] = nodeScope.list[sn[i]];

		nodeScope.selected.push(...sn);
	}

	_clearSelectedId(container){
		let {cableScope, nodeScope} = container;
		let cSelected = cableScope.selected;
		let nSelected = nodeScope.selected;

		if(cSelected.length !== 0)
			cSelected.splice(0);

		if(nSelected.length !== 0)
			nSelected.splice(0);
	}

	async onSyncIn(data){
		data = await super.onSyncIn(data);
		if(data == null) return;

		let iface;
		if(data.i != null){
			iface = this.instance.ifaceList[data.i];
			if(iface == null) throw new Error("Node list was not synced");
		}

		if(data.w === 'kd'){ // keydown
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

				if(data.t === 'npd'){ // node pointer down
					// ToDo
				}
				else if(data.t === 'npu'){ // node pointer up
					this._applySelectedId(container, data);

					let mx = (data.x - iface.x) * devicePixelRatio * container.scale;
					let my = (data.y - iface.y) * devicePixelRatio * container.scale;

					iface.moveNode({
						stopPropagation(){}, preventDefault(){},
						target: iface.$el[0],
						movementX: mx,
						movementY: my
					});

					this._clearSelectedId(container);
				}
			}
			else if(data.t.slice(0, 1) === 'c'){ // cable
				let container = this.instance.scope('container');
				let cables = container.cableScope;
				let cable, newCable;

				if(data.ci != null){
					cable = cables.list[data.ci];
					if(cable == null) throw new Error("Cable list was not synced");
				}

				if(data.nci != null){
					newCable = cables.list[data.nci];
					if(newCable == null) throw new Error("Cable list was not synced");
				}

				if(data.t === 'cpd'){ // cable pointer down
					// ToDo
				}
				else if(data.t === 'cpu'){ // cable pointer up
					this._applySelectedId(container, data);

					let mx = (data.x - cable.head2[0]) * container.scale;
					let my = (data.y - cable.head2[1]) * container.scale;

					cable.moveCableHead({
						stopPropagation(){}, preventDefault(){},
						target: cables.$el[0],
						movementX: mx,
						movementY: my
					}, true);

					this._clearSelectedId(container);
				}

				else if(data.t === 'ccd'){ // cable created down
					let portList = iface[data.s];
					let port = portList[data.n];

					let el = portList._list.getElement(port);

					this._skipEvent = true;
					let rect = port.findPortElement(el).getBoundingClientRect();
					let cable = port.createCable(rect);
					this._skipEvent = false;
				}
				else if(data.t === 'ccu'){ // cable created up
					cable.head2[0] = data.x;
					cable.head2[1] = data.y;
				}

				else if(data.t === 'ccbd'){ // cable create branch down
					this._skipEvent = true;
					let fakeEv = {
						stopPropagation(){},
						target: container.cableScope.$el[0],
						noMoveListen: true,
						ctrlKey: true,
						type: 'mouse',
						pointerType: 'pointerdown',
						clientX: data.x + container.pos.x,
						clientY: data.y + container.pos.y,
					};

					if(data.ty === 0) // cablePath
						cable.cablePathClicked(fakeEv);
					else cable.createBranch(fakeEv);

					this._skipEvent = false;
				}
				else if(data.t === 'ccbu'){ // cable create branch up
					newCable.moveCableHead({
						stopPropagation(){},
						target: container.cableScope.$el[0],
						noMoveListen: true,
						type: 'mouse',
						pointerType: 'pointerup',
						clientX: data.x + container.pos.x,
						clientY: data.y + container.pos.y,
					});
				}

				else if(data.t === 'cd'){ // cable deleted
					this._skipEvent = true;
					cable._evDisconnected = true;
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
	win.console.log = console.log;
	win.console.error = console.error;
	win.ins.onSyncOut = v => win.opener.postMessage(v);

	let ins = new Blackprint.RemoteSketch(SketchList[0]);
	window.onmessage = function(msg){ ins.onSyncIn(msg.data) };
	window.onbeforeunload = ()=> win.close();
	ins.onSyncOut = v => win.postMessage(v);
}
 */
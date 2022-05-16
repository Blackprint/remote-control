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
			transition: 0.15s ease-out transform;
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

		this._scope = initContainer(instance);
		let { ifaceList } = instance;

		let that = this;
		let $window = $(sf.Window);
		let uid = Math.random()*10000 | 0; // ToDo: replace this on the relay server

		let container = this.instance.scope('container');
		function getSelectedIDs(){
			let {cableScope, nodeScope} = container;
			let cSelected = cableScope.selected;
			let nSelected = nodeScope.selected;

			// Don't use 'nodeScope' as the index may get changed on focus/click
			let nodeList = container.$space.sketch.ifaceList;

			let sc = [];
			for (var i = 0; i < cSelected.length; i++)
				sc.push(cableScope.list.indexOf(cSelected[i]));

			let sn = [];
			for (var i = 0; i < nSelected.length; i++)
				sn.push(nodeList.indexOf(nSelected[i]));

			return {sc, sn};
		}

		let npu, cpu, selpu;
		function pointerdown(ev){
			if(that._skipEvent || !ev.isTrusted || ev.button !== 0) return;
			let node = ev.target.closest('.nodes .node');
			let cable = ev.target.closest('.cables g');

			if(node != null){
				let iface = node.model;
				if(iface == null) return; // Skip sync for custom node

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
					return; // Disable sync for now
					that._onSyncOut({uid, w:'skc', t:'selpd', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y});

					selpu = true;
					$window.once('pointerup', () => {
						if(selpu === false) return;
						that._onSyncOut({uid, w:'skc', t:'selpu', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y});
					}, {capture: true});
				}
			}
		}

		let lastMoveEv, delayMoveEvent;
		function pointermove(ev){
			if(!ev.isTrusted) return;
			if(delayMoveEvent){
				lastMoveEv = ev;
				return;
			}

			delayMoveEvent = true;
			setTimeout(()=> {
				delayMoveEvent = false;
				if(lastMoveEv == null) return;

				pointermove(lastMoveEv);
			}, 70);

			lastMoveEv = null;
			that._onSyncOut({uid, w:'skc', t:'pm', x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y});
		}

		$window
			.on('pointerdown', pointerdown, {capture: true})
			.on('pointermove', pointermove, {capture: true});

		let cableCreated;
		instance.on('cable.created', cableCreated = ({ port, cable }) => {
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
		});

		let cableCreatedBranch;
		instance.on('cable.create.branch', cableCreatedBranch = ev => {
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
		});

		let cableDeleted;
		instance.on('cable.deleted', cableDeleted = ({ cable }) => {
			if(that._skipEvent || cable._evDisconnected) return;
			let list = container.cableScope.list;
			let ci = list.indexOf(cable);

			cable._evDisconnected = true;
			that._onSyncOut({uid, w:'skc', t:'cd', ci});
		});

		let destroyTemp = this.destroy;
		this.destroy = function(){
			$window
				.off('pointerdown', pointerdown, {capture: true})
				.off('pointermove', pointermove, {capture: true});

			instance.off('cable.create.branch', cableCreatedBranch);
			instance.off('cable.created', cableCreated);
			instance.off('cable.deleted', cableDeleted);

			this.onSyncIn = ()=>{};
			this.onSyncOut = ()=>{};
			destroyTemp();
		}
	}

	_applySelectedId(container, data){
		let {sn, sc} = data;
		if(sn.length === 0 && sc.length === 0) return;

		let {nodeScope, cableScope} = container;
		let nodeL = nodeScope.selected;
		let cableL = cableScope.selected;
		let nodeList = container.$space.sketch.ifaceList;

		// Don't use 'nodeScope' as the index may get changed on focus/click
		for (var i = 0; i < sn.length; i++)
			nodeL[i] = nodeList[sn[i]];

		for (var i = 0; i < sc.length; i++)
			cableL[i] = cableScope.list[sc[i]];
	}

	_clearSelected(container){
		let {nodeScope, cableScope} = container;
		nodeScope.selected.length = 0;
		cableScope.selected.length = 0;
	}

	_temporarySelection(container, reapply){
		let {nodeScope, cableScope} = container;

		// Let's use method below to avoid triggering SF's RepeatedElement feature
		if(!reapply){
			let tempA = nodeScope.selected.slice(0);
			let tempB = cableScope.selected.slice(0);

			nodeScope.selected.length = 0;
			cableScope.selected.length = 0;

			return {tempA, tempB};
		}

		let {tempA, tempB} = reapply;
		let nodeL = nodeScope.selected;
		let cableL = cableScope.selected;

		for (var i = 0; i < tempA.length; i++)
			nodeL[i] = tempA[i];

		for (var i = 0; i < tempB.length; i++)
			cableL[i] = tempB[i];
	}

	async onSyncIn(data){
		data = await super.onSyncIn(data);
		if(data == null) return;

		let iface;
		if(data.i != null){
			iface = this.instance.ifaceList[data.i];
			if(iface == null) throw new Error("Node list was not synced");
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
					let temp = this._temporarySelection(container, false);
					this._applySelectedId(container, data);

					let mx = (data.x - iface.x) * devicePixelRatio * container.scale;
					let my = (data.y - iface.y) * devicePixelRatio * container.scale;

					iface.moveNode({
						stopPropagation(){}, preventDefault(){},
						target: iface.$el[0],
						movementX: mx,
						movementY: my
					});

					this._clearSelected(container);
					this._temporarySelection(container, temp);
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
					let temp = this._temporarySelection(container, false);
					this._applySelectedId(container, data);

					let mx = (data.x - cable.head2[0]) * container.scale;
					let my = (data.y - cable.head2[1]) * container.scale;

					let evTemp = {
						stopPropagation(){}, preventDefault(){},
						target: cables.$el[0],
						movementX: mx,
						movementY: my
					};

					cable.moveCableHead(evTemp, true);
					container.moveSelection(evTemp, cable);

					this._clearSelected(container);
					this._temporarySelection(container, temp);
				}

				else if(data.t === 'ccd'){ // cable created down
					let portList = iface[data.s];
					let port = portList[data.n];

					let el = portList._portList.getElement(port);

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
// Remote Control between Sketch <-> Sketch
// Used by Sketch to sync data or remoting with other Sketch

function initContainer(instance) {
	let spaceEl = instance.scope.domList[0];

	// This must be template only, don't insert dynamic data with ${...}
	spaceEl.querySelector('sf-m[name="container"]').insertAdjacentHTML('beforeEnd', `<sf-m name="remote-sketch">
		<div>
			<div class="cursor" user-id="{{ val.uid }}" sf-each="val in remotes" style="transform: translate3d({{ val.x }}px, {{ val.y }}px, 0px)">
				<i class="fa fa-mouse-pointer"></i>
				<span>{{ val.name || val.uid }}</span>
			</div>
		</div>
		<div>
			<div class="selection-box" sf-each="val in remoteSelects" style="
				height: {{ val.h }}px;
				width: {{ val.w }}px;
				transform: translate3d({{ val.x }}px, {{ val.y }}px, 0px)
						scale({{ val.ix ? '-':'' }}1, {{ val.iy ? '-':'' }}1);"></div>
		</div>
	</sf-m>`);

	return instance.scope('remote-sketch');
}

if(globalThis.sf != null){
	sf.$(function(){
		setTimeout(() => {
			if(Blackprint.Sketch != null){
				Blackprint.space.model('remote-sketch', function(My){
					My.remotes = [];
					My.remoteSelects = {};

					My.init = function(){
						Blackprint.emit('_remoteSketchScope', {scope: My});
					}
				});
			}
		}, 200);
	});
}

class RemoteSketch extends RemoteControl {
	constructor(instance){
		super(instance);
		this.isSketch = true;

		let that = this;
		let $window = $(sf.Window);
		let uid = Math.random()*10000 | 0; // ToDo: replace this on the relay server

		function getSelectedIDs(_nodeList, container){
			let {cableScope, nodeScope} = container;
			let cSelected = cableScope.selected;
			let nSelected = nodeScope.selected;

			// Don't use 'nodeScope' as the index may get changed on focus/click
			let nodeList = _nodeList;

			let sc = [];
			for (var i = 0; i < cSelected.length; i++)
				sc.push(cableScope.list.indexOf(cSelected[i]));

			let sn = [];
			for (var i = 0; i < nSelected.length; i++)
				sn.push(nodeList.indexOf(nSelected[i]));

			return {sc, sn};
		}

		let npu, cpu, selpu, fid;
		function pointerdown(ev){
			if(that._skipEvent || !ev.isTrusted || ev.button !== 0) return;
			let sketch = ev.target.closest('sketch-page');
			if(sketch == null) return;

			let instance = sketch.model.sketch;
			let container = that._getContainer(instance);
			let ifaceList = instance.ifaceList;

			fid = getFunctionId(instance);
			let node = ev.target.closest('.nodes .node');
			let cable = ev.target.closest('.cables g');

			if(node != null){
				let iface = node.model;
				if(iface == null) return; // Skip sync for custom node

				let i = ifaceList.indexOf(node.model);
				that._onSyncOut({uid, w:'skc', t:'npd', fid, x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y, i});

				npu = true;
				$window.once('pointerup', () => {
					if(npu === false) return;
					let {sn, sc} = getSelectedIDs(ifaceList, container);
					that._onSyncOut({uid, w:'skc', t:'npu', x:iface.x, y:iface.y, i, fid,
						sn, sc
					});
				}, {capture: true});
			}
			else if(cable != null){
				cable = cable.model;
				let ci = container.cableScope.list.indexOf(cable);

				that._onSyncOut({uid, w:'skc', t:'cpd', fid,
				    x:ev.clientX-container.pos.x,
				    y:ev.clientY-container.pos.y,
					ci,
				});

				cpu = true;
				$window.once('pointerup', () => {
					if(cpu === false) return;
					let {sn, sc} = getSelectedIDs(ifaceList, container);
					that._onSyncOut({uid, w:'skc', t:'cpu', fid, ci, sn, sc,
					    x:cable.head2[0], y:cable.head2[1],
					});
				}, {capture: true});
			}
			else {
				setTimeout(() => {
					if(container.select.show){ // selecting
						that._onSyncOut({uid, w:'skc', t:'selpd', fid,
							x:ev.clientX - container.offset.x - container.pos.x,
							y:ev.clientY - container.offset.y - container.pos.y
						});

						selpu = true;
						$window.once('pointerup', () => {
							if(selpu === false) return;
							that._onSyncOut({uid, w:'skc', t:'selpu', fid,
								x:ev.clientX - container.offset.x - container.pos.x,
								y:ev.clientY - container.offset.y - container.pos.y
							});
						}, {capture: true});
					}
				}, 50);
			}
		}

		let lastMoveEv, delayMoveEvent;
		function pointermove(ev){
			if(!ev.isTrusted) return;
			if(delayMoveEvent){
				lastMoveEv = ev;
				return;
			}

			let sketch = ev.target.closest('sketch-page');
			if(sketch == null) return;
			sketch = sketch.model.sketch;

			let container = that._getContainer(sketch);
			fid = getFunctionId(sketch);

			delayMoveEvent = true;
			setTimeout(()=> {
				delayMoveEvent = false;
				if(lastMoveEv == null) return;

				pointermove(lastMoveEv);
			}, 70);

			lastMoveEv = null;
			that._onSyncOut({uid, w:'skc', t:'pm', fid, x:ev.clientX-container.pos.x, y:ev.clientY-container.pos.y});
		}

		$window
			.on('pointerdown', pointerdown, {capture: true})
			.on('pointermove', pointermove, {capture: true});

		let cableCreated;
		instance.on('cable.created', cableCreated = ({ port, cable }) => {
			if(that._skipEvent || this.stopSync) return;
			let ifaceList = port.iface.node.instance.ifaceList;
			let i = ifaceList.indexOf(port.iface);
			let iER = port.isRoute; // isEdgeRoute
			fid = getFunctionId(port.iface);

			let container = that._getContainer(port);
			that._onSyncOut({uid, w:'skc', t:'ccd', fid, i, n: port.name || '', s: iER ? 'route' : port.source});

			cpu = false;
			$window.once('pointerup', (event) => {
				if(cable._evDisconnected) return;

				let list = container.cableScope.list;
				let ci = list.indexOf(cable);

				that._onSyncOut({uid, w:'skc', t:'ccu', fid, x:cable.head2[0], y:cable.head2[1], ci});
			}, {capture: true});
		});

		let cableCreatedBranch;
		instance.on('cable.create.branch', cableCreatedBranch = ev => {
			if(that._skipEvent || this.stopSync) return;
			let { event, cable, type } = ev; // Don't destructure newCable
			let container = that._getContainer(cable);
			let list = container.cableScope.list;
			let ty = type === 'cablePath' ? 0 : 1;

			let ci = list.indexOf(cable);
			that._onSyncOut({uid, w:'skc', t:'ccbd', ci, ty, fid,
			    x:event.clientX - container.pos.x,
			    y:event.clientY - container.pos.y,
			});

			cpu = false;
			$window.once('pointerup', (event) => {
				if(cable._evDisconnected) return;
				let ci = list.indexOf(cable);
				let nci = list.indexOf(ev.newCable);

				that._onSyncOut({uid, w:'skc', t:'ccbu', ci, nci, ty, fid,
				    x:event.clientX - container.pos.x,
				    y:event.clientY - container.pos.y,
				});
			}, {capture: true});
		});

		let cableDeleted;
		instance.on('cable.deleted', cableDeleted = ({ cable }) => {
			if(that._skipEvent || cable._evDisconnected) return;
			let container = that._getContainer(cable);
			let list = container.cableScope.list;
			let ci = list.indexOf(cable);

			cable._evDisconnected = true;
			that._onSyncOut({uid, w:'skc', t:'cd', fid, ci});
		});
		
		let edNodeComment;
		instance.on('_editor.node.comment', edNodeComment = ({ iface }) => {
			if(that._skipEvent || this.stopSync) return;
			let i = ifaceList.indexOf(iface);
			fid = getFunctionId(iface);
			that._onSyncOut({uid, w:'skc', t:'enoco', fid, i, v: iface.comment});
		});

		let destroyTemp = this.destroy;
		this.destroy = function(){
			$window
				.off('pointerdown', pointerdown, {capture: true})
				.off('pointermove', pointermove, {capture: true});

			instance.off('cable.create.branch', cableCreatedBranch);
			instance.off('cable.created', cableCreated);
			instance.off('cable.deleted', cableDeleted);
			instance.off('_editor.node.comment', edNodeComment);

			this.onSyncIn = ()=>{};
			this.onSyncOut = ()=>{};
			destroyTemp();
		}
	}

	_getContainer(obj){
		// if instance
		if(obj.scope != null) return obj.scope('container');

		if(obj.owner != null) obj = obj.owner; // if cable
		if(obj.iface != null) obj = obj.iface; // if port
		if(obj.$el != null) // if iface
			return obj.$el[0].closest('sketch-page').model.sketch.scope('container');

		throw new Error("Fail to obtain container");
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

		let instance = this.instance;
		if(data.fid != null){
			// Use the current active function page
			let used = getDeepProperty(this.instance.functions, data.fid.split('/')).used;
			for (var i=0; i < used.length; i++) {
				let temp = used[i];
				instance = temp.$el?.[0].closest('.page-current');
				if(instance != null){
					instance = temp.bpInstance;
					break;
				}
			}

			if(i === used.length) instance = getDeepProperty(this.instance.functions, data.fid.split('/')).used[0].bpInstance;
			if(instance == null) return this._resync('FunctionNode');
		}

		let { ifaceList } = instance;

		let iface;
		if(data.i != null){
			iface = ifaceList[data.i];
			if(iface == null) return this._resync('Node');
		}

		if(data.w === 'skc'){ // sketch event
			if(data.t === 'selpd'){ // selection pointer down
				let { remoteSelects } = instance.scope('remote-sketch');
				if(remoteSelects[data.uid] == null){
					sf.Obj.set(remoteSelects, data.uid, { w:0, h:0, x: data.x, y: data.y, ix: false, iy: false });
				}
			}
			else if(data.t === 'selpu'){ // selection pointer up
				let { remoteSelects } = instance.scope('remote-sketch');
				sf.Obj.delete(remoteSelects, data.uid);
			}
			else if(data.t.slice(0, 1) === 'n'){ // node
				let container = instance.scope('container');

				if(data.t === 'npd'){ // node pointer down
					// ToDo
				}
				else if(data.t === 'npu'){ // node pointer up
					let temp = this._temporarySelection(container, false);
					this._applySelectedId(container, data);

					let mx = (data.x - iface.x) * devicePixelRatio * container.scale;
					let my = (data.y - iface.y) * devicePixelRatio * container.scale;

					let evTemp = {
						stopPropagation(){}, preventDefault(){},
						target: iface.$el?.[0],
						movementX: mx,
						movementY: my
					};

					iface.moveNode(evTemp);
					container.moveSelection(evTemp, iface);

					this._clearSelected(container);
					this._temporarySelection(container, temp);
				}
			}
			else if(data.t.slice(0, 1) === 'c'){ // cable
				let container = instance.scope('container');
				let cables = container.cableScope;
				let cable, newCable;

				if(data.ci != null){
					cable = cables.list[data.ci];
					if(cable == null) return this._resync('Cable');
				}

				if(data.nci != null){
					newCable = cables.list[data.nci];
					if(newCable == null) return this._resync('Cable');
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
						target: cables.$el?.[0],
						movementX: mx,
						movementY: my
					};

					cable.moveCableHead(evTemp, true);
					container.moveSelection(evTemp, cable);

					this._clearSelected(container);
					this._temporarySelection(container, temp);
				}

				else if(data.t === 'ccd'){ // cable created down
					if(data.s === 'route'){
						this._skipEvent = true;
						iface.node.routes.createCable();
						this._skipEvent = false;
					}
					else {
						let portList = iface[data.s];
						let port = portList[data.n];
	
						let el = portList._portList.getElement(port);
	
						this._skipEvent = true;
						let rect = port.findPortElement(el).getBoundingClientRect();
						let cable = port.createCable(rect);
						this._skipEvent = false;
					}
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
				if(instance.pendingRender) return;
				let { remotes } = instance._remoteScope ??= initContainer(instance);
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

				let container = instance.scope('container');
				if(instance.pendingRender) return;

				cursor.x = data.x - container.offset.x;
				cursor.y = data.y - container.offset.y;

				if(data.t === 'pd'){ // pointer down
					// ToDo
				}
				else if(data.t === 'pm'){ // pointer move
					// ToDo
					let { remoteSelects } = instance.scope('remote-sketch');

					if(remoteSelects[data.uid] != null){
						let ref = remoteSelects[data.uid];
						ref.ix = ref.x > cursor.x;
						ref.iy = ref.y > cursor.y;
						ref.w = Math.abs(ref.x - cursor.x);
						ref.h = Math.abs(ref.y - cursor.y);
					}
				}
			}
			else if(data.t === 'enoco'){
				iface.comment = data.v;
			}
			else throw new Error("Unhandled sketch control: "+ data.t);
		}
	}
}

Blackprint.RemoteSketch = RemoteSketch;
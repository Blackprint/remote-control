let typeList = [];
let generatedTypes = Object.create(null);
let typeContext = {__virtualTypes: {}};
let nativeTypeList = new Map([
	[String, {name: 'String'}],
	[Number, {name: 'Number'}],
	[Boolean, {name: 'Boolean'}],
	[Object, {name: 'Object'}],
	[Array, {name: 'Array'}],
	[Function, {name: 'Function'}],
	[Blackprint.Types.Any, {name: 'Any'}],
	[Blackprint.Types.Route, {name: 'Route'}],
	[Blackprint.Types.Slot, {name: 'Slot'}],
]);

let pako = window.pako;
if(Blackprint.Environment.isNode){
	let zlib = require('zlib');
	pako = {
		// inflate: zlib.inflateSync,
		deflate: async (data) => await new Promise((resolve, reject)=> {
			zlib.deflate(data, {level: 9}, (err, val) => {
				if(err) return reject(err);
				resolve(val);
			});
		}),
	};
}

Blackprint.PuppetNode = {
	// ToDo: port to PHP, Golang, and other programming languages
	async getRegisteredNodes(options={}){
		let nodes = Blackprint.nodes;
		let list = {};
		let portTypes = Blackprint.Port;

		function typeToString(list){
			return list.map(port => {
				let portType = port.portType ?? port;
				let typeIndex = '';
				let isNativeType = false;

				if(nativeTypeList.has(portType)) {
					portType = nativeTypeList.get(portType);
					isNativeType = true;
				}
				else {
					typeIndex = typeList.indexOf(portType);
					if(typeIndex === -1) {
						typeList.push(portType);
						typeIndex = typeList.length - 1;
					}
				}

				let type = portType.name;
				if(!isNativeType) type = `${portType.name}_${typeIndex}`;

				return type;
			});
		}

		function extractType(store, ports){
			for (let key in ports) {
				let port = ports[key];
				let feature = port.portFeature;

				let temp = store[key] = {};
				let i = 0;
				if(feature != null){
					if(feature === portTypes.ArrayOf) i = 1;
					else if(feature === portTypes.Default) i = 2;
					else if(feature === portTypes.StructOf) i = 3;
					else if(feature === portTypes.Trigger) i = 4;
					else if(feature === portTypes.Union) i = 5;
					else if(feature === portTypes.VirtualType) i = 6;
					temp.feature = i;
				}

				let type;
				if(i !== 5)
					type = typeToString([port.portType ?? port])[0];
				else type = typeToString(port.portType);

				temp.type = type;
			}
		}

		function extract(obj, namespace){
			for (let key in obj) {
				if(namespace === '' && key == 'BP') continue;

				let item = obj[key];
				if(item.prototype instanceof Blackprint.Node){
					let temp = list[namespace+key] = {};

					if(item.input != null){
						let ref = temp.input = {};
						extractType(ref, item.input);
					}
					if(item.output != null){
						let ref = temp.output = {};
						extractType(ref, item.output);
					}

					temp.type = item.type;
					temp.interfaceSync = item.interfaceSync;
				}
				else if(item.constructor === Object)
					extract(item, `${namespace}${key}/`);
			}
		}

		extract(nodes, '');
		if(options.raw) return list;

		list = JSON.stringify(list);
		return await pako.deflate(list);
	},

	// Can only be used on Browser with Blackprint Sketch
	async setRegisteredNodes(data){
		pako ??= window.pako;

		let list = await pako.inflate(data, {to: 'string'});
		list = JSON.parse(list);

		let nodes = Blackprint.nodes;
		for (let key in nodes) {
			sf.Obj.delete(nodes, key);
		}

		let portTypes = Blackprint.Port;
		for (let namespace in list) {
			let node = list[namespace];
			let ports = {};

			['input', 'output'].forEach(which => {
				ports[which] = {};

				let val = node[which];
				for (let key in val) {
					let type = null;
					let temp = val[key];
					if(temp.type === 'Boolean') type = Boolean;
					else if(temp.type === 'String') type = String;
					else if(temp.type === 'Number') type = Number;
					else if(temp.type === 'Object') type = Object;
					else if(temp.type === 'Array') type = Array;
					else if(temp.type === 'Function') type = Function;
					else if(temp.type === 'Any') type = Blackprint.Types.Any;
					else if(temp.type === 'Route') type = Blackprint.Types.Route;
					else if(temp.type === 'Slot') type = Blackprint.Types.Slot;
					else {
						type = generatedTypes[temp.type];
						if(type == null) {
							let clazz = type = generatedTypes[temp.type] = class {};
							Object.defineProperty(clazz, 'name', {value: temp.type});
						}
					}

					if(temp.feature) {
						let feature = temp.feature;
						if(feature === 1) type = portTypes.ArrayOf(type);
						// else if(feature === 2) type = portTypes.Default(type);
						else if(feature === 3) type = portTypes.StructOf(type);
						else if(feature === 4) type = portTypes.Trigger(type, ()=>{});
						else if(feature === 5) {
							let typeList = temp.type.map(val => {
								let type = Blackprint.Port.VirtualType(Object, val.name, typeContext)
								type.name = val.name;
								return type;
							});
							type = portTypes.Union(typeList);
						}
						// else if(feature === 6) type = portTypes.VirtualType(type);
					}

					ports[which][key] = type;
				}
			});

			let title = namespace.split('/').pop();
			Blackprint.registerNode(namespace, class extends Blackprint.Node {
				static input = ports.input;
				static output = ports.output;
				static type = node.type;
				static interfaceSync = node.interfaceSync;
				static interfaceDocs = node.interfaceDocs;

				constructor(instance){
					super(instance);
					let iface = this.setInterface("BPIC/BPRemote/PuppetNode");
					iface.title = node.interfaceDocs?.title ?? title;
					iface.description = node.interfaceDocs?.summary ?? namespace;
					iface.extension = node.extension;

					if(node.interfaceDocs != null){
						let docs = node.interfaceDocs;
						iface.docs = {};
						iface.docs.description = docs.description;

						Promise.resolve(true).then(() => {
							let input = iface.docs.input = {};
							for (let key in docs.input) {
								iface.input[key].docs = input[key] = { description: docs.input[key] };
							}

							let output = iface.docs.output = {};
							for (let key in docs.output) {
								iface.output[key].docs = output[key] = { description: docs.input[key] };
							}
						});
					}
				}
				update(){}
				syncIn(id, data){ this.iface.syncIn(id, data) }
			});
		}

		// Remove external modules URL list
		Blackprint.modulesURL = {};
		Blackprint._modulesURL?.splice(0);
	}
}

Blackprint.registerInterface("BPIC/BPRemote/PuppetNode",
Blackprint._IPuppetNode = class extends Blackprint.Interface {
	syncIn(){} // Do nothing
});

/**
 * Namepace: {
 *   type: "flow-control",
 *   interfaceSync: [ {type: "text_out", id: "theId"} ],
 *   input: { name: {type: "String", feature: 0}, ... },
 *   output: { name: {type: "String", feature: 0}, ... },
 * }
 */
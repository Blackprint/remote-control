import Blackprint
import zlib
import json
import types

typeList = []
typeContext = {'__virtualTypes': {}}
nativeTypeList = [
	[str, 'String'],
	[int, 'Integer'],
	[float, 'Number'],
	[complex, 'Complex'],
	[bool, 'Boolean'],
	[dict, 'Object'],
	[list, 'List'],
	[tuple, 'Tuple'],
	[range, 'Range'],
	[types.FunctionType, 'Function'],
	[set, 'Set'],
	[Blackprint.Types.Any, 'Any'],
	[Blackprint.Types.Route, 'Route'],
	[Blackprint.Types.Slot, 'Slot'],
]

def getNativeType(type):
	for x in nativeTypeList:
		if(x[0] == type): return x[1]
	return None

# ToDo: port to PHP, Golang, and other programming languages
def getRegisteredNodes(options={}):
	nodes = Blackprint.Internal.nodes
	list = {}
	portTypes = Blackprint.Port

	def typeToString(list):
		types = []
		for i in range(len(list)):
			port = list[i]
			portType = port['type'] if isinstance(port, dict) else port
			nativeType = getNativeType(portType)

			typeIndex = ''
			if(nativeType == None):
				typeIndex = typeList.index(portType) if typeList in typeList else -1
				if(typeIndex == -1):
					typeList.append(portType)
					typeIndex = len(typeList) - 1

			type = nativeType
			if(type == None): type = portType.__name__ + "_" + str(typeIndex)

			types.append(type)
		
		return types

	def extractType(store, ports):
		for key, port in ports.items():
			temp = store[key] = {}
			i = 0

			type = None
			if(isinstance(port, dict)):
				feature = port['feature']
				if(feature != None):
					if(feature == portTypes.ArrayOf): i = 1
					elif(feature == portTypes.Default): i = 2
					elif(feature == portTypes.StructOf): i = 3
					elif(feature == portTypes.Trigger): i = 4
					elif(feature == portTypes.Union): i = 5
					elif(feature == portTypes.VirtualType): i = 6
					temp['feature'] = i

			if(i != 5):
				type = typeToString([
					port['type'] if isinstance(port, dict) else port
				])[0]
			else: type = typeToString(port['type'])

			temp['type'] = type

	def extract(obj, namespace):
		for key, item in obj.items():
			if(namespace == '' and key.startswith('BP')): continue

			if(issubclass(item, Blackprint.Node)):
				temp = list[namespace+key] = {}

				if(item.input != None):
					ref = temp['input'] = {}
					extractType(ref, item.input)
				if(item.output != None):
					ref = temp['output'] = {}
					extractType(ref, item.output)

				temp['type'] = item.type
				temp['interfaceSync'] = item.interfaceSync
			elif(isinstance(item, dict)):
				extract(item, namespace+key+"/")

	extract(nodes, '')
	if(('raw' in options) and options['raw']): return list

	list = json.dumps(list)
	return zlib.compress(str.encode(list))

@Blackprint.registerInterface("BPIC/BPRemote/PuppetNode")
class _IPuppetNode(Blackprint.Interface):
	def syncIn(): 1 # Do nothing

# /**
#  * Namepace: {
#  *   type: "flow-control",
#  *   interfaceSync: [ {type: "text_out", id: "theId"} ],
#  *   input: { name: {type: "String", feature: 0}, ... },
#  *   output: { name: {type: "String", feature: 0}, ... },
#  * }
#  */
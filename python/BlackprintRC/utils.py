# haveSymbol = r"/[~`!@#$%^&*()+={}|[\]\\:\";'<>?,./ ]/"

import Blackprint

def getFunctionId(iface):
	if(iface == None): return None
	if(isinstance(iface, Blackprint.Engine)): # if instance
		if(iface.parentInterface == None): return None
		return iface.parentInterface.node.bpFunction.id

	if(iface.node.instance.parentInterface == None): return None
	return iface.node.instance.parentInterface.node.bpFunction.id
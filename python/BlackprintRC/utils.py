# haveSymbol = r"/[~`!@#$%^&*()+={}|[\]\\:\";'<>?,./ ]/"

import Blackprint

def getFunctionId(iface):
	if(iface == None): return None
	if(isinstance(iface, Blackprint.Engine)): # if instance
		if(iface._funcMain == None): return None
		return iface._funcMain.node._funcInstance.id

	if(iface.node.instance._funcMain == None): return None
	return iface.node.instance._funcMain.node._funcInstance.id
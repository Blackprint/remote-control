local BlackprintRC = {}

-- Import all modules
BlackprintRC.PuppetNode = require('@src/PuppetNode.lua')
BlackprintRC.RemoteBase = require('@src/RemoteBase.lua')
BlackprintRC.RemoteEngine = require('@src/RemoteEngine.lua')
BlackprintRC.Node = require('@src/Node.lua')

-- Export functions from PuppetNode
BlackprintRC.getRegisteredNodes = BlackprintRC.PuppetNode.getRegisteredNodes

-- Export the main module
return BlackprintRC
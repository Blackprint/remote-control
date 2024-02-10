const haveSymbol = /[~`!@#$%^&*()+={}|[\]\\:";'<>?,./ ]/;
function getElementSelector(element, untilElement){
	if(untilElement === void 0) untilElement = documentElement;
	else if(element === untilElement)
		return [];

	const names = [];
	while(element.parentElement !== null){
		if(element === untilElement) break;
		else {
			let e = element;
			let i = 0;

			while(e.previousSibling){
				e = e.previousSibling;
				i++;
			}

			names.unshift(i);
		}

		element = element.parentElement;
		if(element === null)
			break;
	}

	return names;
}

function elementChildIndexes(array, context){
	if(array.length === 0) // 2ms
		return context;

	let element = context || documentElement;

	if(array[0].constructor === String && element.id !== array[0].slice(1)) // 3.9ms
		element = element.querySelector(array[0]);

	for (let i = 0; i < array.length; i++) {
		element = array[i] === 0
			? element.firstChild
			: element.childNodes.item(array[i]); // 37ms

		if(element === null)
			return null;
	}

	return element;
}

function getFunctionId(iface){
	if(iface == null) return null;
	if(iface instanceof Blackprint.Engine) // if instance
		return iface.parentInterface?.node.bpFunction.id;

	return iface.node.instance.parentInterface?.node.bpFunction.id;
}

var getDeepProperty = Blackprint._utils.getDeepProperty;
var setDeepProperty = Blackprint._utils.setDeepProperty;
var deleteDeepProperty = Blackprint._utils.deleteDeepProperty;
# Blackprint - Remote Control
This module will provide an ability for Blackprint to control engine remotely and can be used for multi-user collaboration

> Not for production!<br>
> Please remove this feature if you're going to ship your product, unless you know what you're doing. This module gives ability to remotely control your software, you will need a sandboxed environment and permission based system in order to ship to production..

Any ports data flow for sketch will be disabled if it's connected to remote engine. It's not recommended to combine different data flow between `remote <~> remote` in just one instance, you should create two different instance for them and use feature from other module/library to sync data between the two instance itself.

Please try `example/remote-engine.py` if you want to create a remote engine instance. You will need to load your nodes/module from the `.py` and connect to Blackprint Editor `Menu -> Remote -> Engine`. Then you will need to sync the nodes with `Menu -> Remote -> Sync -> PuppetNode`.

# License
MIT License
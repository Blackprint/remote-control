# Blackprint - Remote Control
This module will provide an ability for Blackprint to control engine remotely and can be used for multi-user collaboration

> ⚠️ **Production Warning**<br>
> This module is **not intended for production use** without proper security measures. If you plan to ship this feature in a production environment, you must implement:
>
> - **Sandboxed Environment**: Isolate the remote control functionality in a secure sandbox
> - **Permission-Based System**: Implement proper authentication and authorization
> - **Input Validation**: Validate all incoming remote commands and data
> - **Rate Limiting**: Prevent abuse and denial-of-service attacks
> - **Secure Communication**: Use encrypted connections and proper certificate validation
>
> **Recommendation**: Remove this feature entirely from production builds unless you have implemented comprehensive security measures and understand the risks involved. Remote control capabilities can expose your application to significant security vulnerabilities if not properly secured.

Any ports data flow for sketch will be disabled if it's connected to remote engine. It's not recommended to combine different data flow between `remote <~> remote` in just one instance, you should create two different instance for them and use feature from other module/library to sync data between the two instance itself.

Please try `example/remote-engine.py` if you want to create a remote engine instance. You will need to load your nodes/module from the `.py` and connect to Blackprint Editor `Menu -> Remote -> Engine`. Then you will need to sync the nodes with `Menu -> Remote -> Sync -> PuppetNode`.

# License
MIT License
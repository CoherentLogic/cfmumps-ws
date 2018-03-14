const express = require('express');
const router = express.Router();
const nodem = require('nodem');
const _ = require('lodash');
const db = new nodem.Gtm();
db.open();


console.log("Initializing route handlers...");

function fastClone(obj)
{
    return JSON.parse(JSON.stringify(obj));
}

function isNumeric(n)
{
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function buildObject(obj, keyArray, value, lastKeyEmpty)
{
    if(lastKeyEmpty) {
       keyArray.push("");
    }
    
    lastKeyIndex = keyArray.length - 1;

    for(var i = 0; i < lastKeyIndex; ++ i) {
        
        key = keyArray[i];
        
        if (!(key in obj)) {
           obj[key] = {};
        }
        
        obj = obj[key];
    }

    obj[keyArray[lastKeyIndex]] = value;    
}

var current = {
    global: null,
    subscripts: []
};

const nodemAPI = {

    getObject: function (global, subscripts) {

        current.global = global;
        current.subscripts = subscripts;

        var result = null;

        try {
            result = {
                value: nodemAPI.getObjectX(), 
                success: true
            };
        }
        catch(ex) {
            result = {
                value: {}, 
                success: false, 
                message: ex,                 
            };
        }
 
        return result;
    },

    getObjectX: function (subscripts, outputStruct) {

        if(subscripts) {
            var mSubscripts = fastClone(subscripts);
        }
        else {
            var mSubscripts = fastClone(current.subscripts);
        }

        if(!outputStruct) {
            var outStruct = {};
        }
        else {
            var outStruct = fastClone(outputStruct);
        }

        var lastResult = false;
        
        mSubscripts.push("");

        while(!lastResult) {

            var order = db.order({global: current.global, subscripts: mSubscripts});
            
            if(!order.ok) {
                logger.debug("getObjectX() failed on nodem order() call");
                throw("NodeM error calling order()");
            }

            if(order.result === "") {
                lastResult = true;
                
                continue;
            }

            mSubscripts = order.subscripts;
            
            var structSubs = mSubscripts.slice(current.subscripts.length);
            var data = db.data({global: current.global, subscripts: mSubscripts});

            switch(data.defined) {
            case 11:
                var nodeValue = db.get({global: current.global, subscripts: mSubscripts});

                if(!nodeValue.ok) {
                    logger.debug("getObjectX() failed on nodem get() call");
                    throw("NodeM error calling get()");
                }

                buildObject(outStruct, structSubs, nodeValue.data, true);
                _.extend(outStruct, nodemAPI.getObjectX(mSubscripts, outStruct));
                break;
            case 10:
                _.extend(outStruct, nodemAPI.getObjectX(mSubscripts, outStruct))
                break;
            case 1:
                buildObject(outStruct, structSubs, db.get({global: current.global, subscripts: mSubscripts}).data, false);
                break;
            }

        }

        return outStruct;   
    },

    setObject: function (global, subscripts, object) {

        var result = null;

        current.global = global;
        current.subscripts = subscripts;

        try {

            nodemAPI.setObjectX(object);

            result = {               
                success: true
            };
        }
        catch(ex) {
            result = {
                sucess: false
            };
        }

        return result;
    },

    setObjectX: function (inputObject, subscripts) {
    
        if(subscripts) {
            var subs = fastClone(subscripts);
        }
        else {
            var subs = fastClone(current.subscripts);
        }

        for(var key in inputObject) {

            subs.push(key);
            
            switch(typeof inputObject[key]) {
                case 'object':
                    nodemAPI.setObjectX(inputObject[key], subs);
                    break;
                case 'string':
                case 'number':                
                    var result = db.set({global: current.global, subscripts: subs, data: inputObject[key]});
                    if(!result.ok) {
                        logger.debug("setObjectX() failed on nodem set() call");
                        throw("NodeM error calling set()");
                    }
                    break;
            }

            subs.pop();
        }

        return;
    }
}


router.post('/version', (req, res, next) => {
      
   let version = db.version();

   if(typeof version === "object") {
    res.status(500).json({
        success: false,
        message: version.errorMessage || version.ErrorMessage
    });    
   }
   else {
    res.status(200).json({
        success: true,
        version: version
    });
   }

});

router.post('/pid', (req, res, next) => {
    res.status(200).json({
        success: true,
        pid: process.pid
    });
});

router.post('/get', (req, res, next) => {

    if(!req.body.global) {
        res.status(500).json({
            success: false,
            message: "Must pass global"
        });

        return;
    }

    if(!req.body.subscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass subscripts"
        });

        return;
    }

    let result = db.get({
        global: req.body.global, 
        subscripts: req.body.subscripts
    });

    if(result.ok === 0) {
        res.status(500).json({
            success: false,
            message: result.errorMessage || result.ErrorMessage
        });    
    }
    else {
        res.status(200).json({
            success: true,
            value: result.data
        });
    }

});

router.post('/set', (req, res, next) => {

    if(!req.body.global) {
        res.status(500).json({
            success: false,
            message: "Must pass global"
        });

        return;
    }

    if(!req.body.subscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass subscripts"
        });

        return;
    }

    if(!req.body.value) {
        res.status(500).json({
            success: false,
            message: "Must pass value"
        });

        return;
    }

    let result = db.set({
        global: req.body.global, 
        subscripts: req.body.subscripts,
        data: req.body.value
    });

    if(result.ok === 0) {
        res.status(500).json({
            success: false,
            message: result.errorMessage || result.ErrorMessage
        });    
    }
    else {
        res.status(200).json({
            success: true,
            value: req.body.value
        });
    }    
    
});

router.post('/merge', (req, res, next) => {
    if(!req.body.fromGlobal) {
        res.status(500).json({
            success: false,
            message: "Must pass fromGlobal"
        });

        return;
    }

    if(!req.body.fromSubscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass fromSubscripts"
        });

        return;
    }

    if(!req.body.toGlobal) {
        res.status(500).json({
            success: false,
            message: "Must pass toGlobal"
        });

        return;
    }

    if(!req.body.toSubscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass toSubscripts"
        });

        return;
    }

    let result = db.merge({
        from: {
            global: req.body.fromGlobal,
            subscripts: req.body.fromSubscripts
        },
        to: {
            global: req.body.toGlobal,
            subscripts: req.body.toSubscripts
        }
    });

    if(result.ok === 0) {
        res.status(500).json({
            success: false,
            message: result.errorMessage || result.ErrorMessage
        });    
    }
    else {
        res.status(200).json({
            success: true
        });
    } 

});

router.post('/getobject', (req, res, next) => {

    if(!req.body.global) {
        res.status(500).json({
            success: false,
            message: "Must pass global"
        });

        return;
    }

    if(!req.body.subscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass subscripts"
        });

        return;
    }

    let result = nodemAPI.getObject(req.body.global, req.body.subscripts);

    res.status(200).json(result);


});

router.post('/setobject', (req, res, next) => {

    if(!req.body.global) {
        res.status(500).json({
            success: false,
            message: "Must pass global"
        });

        return;
    }

    if(!req.body.subscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass subscripts"
        });

        return;
    }

    if(!req.body.object) {
        res.status(500).json({
            success: false,
            message: "Must pass object"
        });

        return;
    }

    let result = nodemAPI.setObject(req.body.global, req.body.subscripts, req.body.object);

    res.status(200).json(result);

});

router.post('/kill', (req, res, next) => {
    
    if(!req.body.global) {
        res.status(500).json({
            success: false,
            message: "Must pass global"
        });

        return;
    }

    if(!req.body.subscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass subscripts"
        });

        return;
    }


    let result = db.kill({
        global: req.body.global, 
        subscripts: req.body.subscripts        
    });

    if(result.ok === 0) {
        res.status(500).json({
            success: false,
            message: result.errorMessage || result.ErrorMessage
        });    
    }
    else {
        res.status(200).json({
            success: true,            
        });
    }
});

router.post('/lock', (req, res, next) => {
    if(!req.body.global) {
        res.status(500).json({
            success: false,
            message: "Must pass global"
        });

        return;
    }

    if(!req.body.subscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass subscripts"
        });

        return;
    }

    if(!req.body.timeout) {
        res.status(500).json({
            success: false,
            message: "Must pass timeout"
        });

        return;
    }

    let result = db.lock({
        global: req.body.global, 
        subscripts: req.body.subscripts,
        timeout: req.body.timeout
    });

    if(result.ok === 0) {
        res.status(500).json({
            success: false,
            message: result.errorMessage || result.ErrorMessage
        });    
    }
    else {
        res.status(200).json({
            success: true
        });
    }
});

router.post('/unlock', (req, res, next) => {
    
    if(!req.body.global) {
        res.status(500).json({
            success: false,
            message: "Must pass global"
        });

        return;
    }

    if(!req.body.subscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass subscripts"
        });

        return;
    }   

    let result = db.unlock({
        global: req.body.global, 
        subscripts: req.body.subscripts
    });

    if(result.ok === 0) {
        res.status(500).json({
            success: false,
            message: result.errorMessage || result.ErrorMessage
        });    
    }
    else {
        res.status(200).json({
            success: true
        });
    }
});

router.post('/order', (req, res, next) => {
    
    if(!req.body.global) {
        res.status(500).json({
            success: false,
            message: "Must pass global"
        });

        return;
    }

    if(!req.body.subscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass subscripts"
        });

        return;
    }
   
    let order = db.order({
        global: req.body.global, 
        subscripts: req.body.subscripts
    });

    if(order.ok === 0) {
        res.status(500).json({
            success: false,
            message: order.errorMessage || order.ErrorMessage
        });    
    }
    else {
        res.status(200).json({
            success: true,
            order: order.result
        });
    }    

});

router.post('/data', (req, res, next) => {
    
    if(!req.body.global) {
        res.status(500).json({
            success: false,
            message: "Must pass global"
        });

        return;
    }

    if(!req.body.subscripts) {
        res.status(500).json({
            success: false,
            message: "Must pass subscripts"
        });

        return;
    }

    let result = db.data({
        global: req.body.global, 
        subscripts: req.body.subscripts        
    });

    if(result.ok === 0) {
        res.status(500).json({
            success: false,
            message: result.errorMessage || result.ErrorMessage
        });    
    }
    else {
        res.status(200).json({
            success: true,
            value: result.defined
        });
    }

});


router.post('/function', (req, res, next) => {


    if(!req.body.function) {
        res.status(500).json({
            success: false,
            message: "Must pass function"
        });

        return;
    }

    if(!req.body.arguments) {
        res.status(500).json({
            success: false,
            message: "Must pass arguments"
        });

        return;
    }

    let autoRelink = req.body.autoRelink || false;

    let result = db.function({
        function: req.body.function,
        arguments: req.body.arguments,
        autoRelink: autoRelink
    });

    if(!result.ok) {
        console.log(result);

        res.status(500).json({
            success: false,
            message: result.errorMessage || result.ErrorMessage
        });
    }
    else {
        res.status(200).json({
            success: true,
            value: result.result
        });
    }
});

router.post('/procedure', (req, res, next) => {

    if(!req.body.procedure) {

        console.log("/procedure: did not pass procedure");

        res.status(500).json({
            success: false,
            message: "Must pass procedure"
        });

        return;
    }

    if(!req.body.arguments) {

        console.log("/procedure: did not pass arguments");

        res.status(500).json({
            success: false,
            message: "Must pass arguments"
        });

        return;
    }

    let autoRelink = req.body.autoRelink || false;

    try {
        db.procedure({
            procedure: req.body.procedure,
            arguments: req.body.arguments,
            autoRelink: autoRelink
        });

        res.status(200).json({
            success: true
        });
    }
    catch(ex) {
        res.status(500).json({
            success: false,
            message: ex
        });
    }        
});



console.log("Route handlers initialized.");

console.log("\n\nPID " + process.pid + " listening for REST connections.");

module.exports = router;
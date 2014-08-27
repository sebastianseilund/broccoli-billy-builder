var bbRequire, bbDefine;

(function() {
    var entries = {},
        modules = {};

    var load = function (moduleName, allowNotFound) {
        var definition = entries[moduleName];

        if (!definition) {
            if (allowNotFound === true) {
                return null;
            } else {
                var e = Error('Cannot find module '+moduleName);
                e.code = 'MODULE_NOT_FOUND';
                throw e;
            }
        }

        var module = {
            exports: {}
        };
        modules[moduleName] = module;
        definition.call(module.exports, module, module.exports, relativeRequireFactory(moduleName));

        return module;
    };

    var require = function(moduleName, allowNotFound) {
        var module = modules[moduleName];

        if (!module) {
            module = load(moduleName, allowNotFound);
            if (module === null) {
                return null;
            }
        }

        return module.exports;
    };
    bbRequire = require;

    require.entries = entries;

    bbDefine = function(moduleName, definition) {
        entries[moduleName] = definition;
    };

    var relativeRequireFactory = function(requirerName) {
        var requirerDir = requirerName.replace(/\/[^\/]*$/, '');
        var resolve = function(moduleName) {
            if (moduleName.substring(0, 2) === './' || moduleName.substring(0, 3) === '../') {
                moduleName = canonicalizePath(requirerDir + '/' + moduleName);
            }
            return moduleName;
        };
        var relativeRequire = function(moduleName, allowNotFound) {
            moduleName = resolve(moduleName);
            return require(moduleName, allowNotFound);
        };
        relativeRequire.resolve = resolve;
        return relativeRequire;
    };

    var canonicalizePath = function(path) {
        var parts = path.split('/'),
            partCount = parts.length,
            part,
            i,
            canonicalized = [];
        for (i = 0; i < partCount; i++) {
            part = parts[i];
            if (!part || part === '.') {
                continue;
            }
            if (part === '..') {
                canonicalized.pop();
                continue;
            }
            canonicalized.push(part);
        }
        return canonicalized.join('/');
    };
})();

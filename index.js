var _ = require('lodash'),
    Promise = require('bluebird'),
    fs = require('fs'),
    stat = Promise.promisify(fs.stat),
    readFile = Promise.promisify(fs.readFile),
    writeFile = Promise.promisify(fs.writeFile),
    path = require('path'),
    mkdirp = Promise.promisify(require('mkdirp')),
    Writer = require('broccoli-writer'),
    helpers = require('broccoli-kitchen-sink-helpers'),
    jsStringEscape = require('js-string-escape'),
    recursiveReaddir = Promise.promisify(require('recursive-readdir'));

module.exports = BillyBuilder;

BillyBuilder.prototype = Object.create(Writer.prototype);
BillyBuilder.prototype.constructor = BillyBuilder;

function BillyBuilder(inputTree, options) {
    if (!(this instanceof BillyBuilder)) {
        return new BillyBuilder(inputTree, options);
    }

    _.defaults(options, {
        injectHelpers: true,
        wrapInEval: true
    });

    _.extend(this, options);

    this.inputTree = inputTree;
    this.modules = this.modules || {};
    this.shims = this.shims || [];
    this.legacyFiles = this.legacyFiles || [];

    this.cache = {
        readFile: {},
        bower: {}
    };

    if (this.injectHelpers) {
        this.helpersJs = wrapJs(fs.readFileSync(path.join(__dirname, 'helpers.js')).toString(), 'billy-builder-helpers.js', this.wrapInEval);
    }
}

BillyBuilder.prototype.write = function(readTree, destDir) {
    var self = this,
        modules = this.modules,
        namespaces = Object.keys(modules),
        shims = this.shims,
        legacyFiles = this.legacyFiles,
        outputFile = this.outputFile,
        wrapInEval = this.wrapInEval,
        moduleDefinitions = [],
        srcDir,
        output = [];

    var newCache = {
        readFile: {},
        bower: {}
    };

    var extensions = [
        '.js',
        '.json'
    ];

    return readTree(this.inputTree)
        .then(function(foundSrcDir) {
            srcDir = foundSrcDir;
        })
        //Modules
        .then(compileModules)
        .then(addShims)
        .then(compileModuleDefinitions)
        //Legacy
        .then(compileLegacyFiles)
        //Save file
        .then(mkOutputDir)
        .then(saveOutputFile)
        .then(cleanup);

    function compileModules() {
        return Promise.all(namespaces.map(compileModule));
    }

    function compileModule(namespace) {
        return prepareModule(namespace)
            .then(function(mod) {
                var namespace = mod.namespace,
                    main = mod.main;
                if (main) {
                    defineModule(namespace, wrapJs('module.exports = require("'+jsStringEscape(path.join(namespace, main))+'");', namespace+'.js', wrapInEval));
                }
                return getModuleFiles(mod);
            })
            .then(addModuleFiles);
    }

    function prepareModule(namespace) {
        var mod = modules[namespace];
        if (mod === true) {
            mod = {};
        }
        mod.namespace = namespace;
        return getBowerConfigCached(namespace)
            .then(function(config) {
                _.defaults(mod, config);
                return mod;
            });
    }

    function getModuleFiles(mod) {
        var files = [];

        if (mod.main) {
            files.push(path.join(mod.namespace, mod.main+'.js'));
        }

        return Promise.all(mod.include.map(function(dir) {
                var fullDir = path.join(srcDir, mod.namespace, dir);
                return recursiveReaddir(fullDir)
                    .catch(function(e) {
                        //Ignore missing directories
                        if (e.cause.code === 'ENOENT') {
                            return [];
                        }
                        throw e;
                    })
                    .then(function(files) {
                        return files
                            .filter(function(file) {
                                //Only include js and json files that do not start with a dot
                                return extensions.indexOf(path.extname(file)) !== -1 && path.basename(file).indexOf('.') !== 0;
                            })
                            .map(function(file) {
                                return path.relative(srcDir, file);
                            });
                    });
            }))
            .then(function(moreFiles) {
                return files.concat.apply(files, moreFiles);
            });
    }

    function addModuleFiles(files) {
        return Promise.all(files.map(function(file) {
            return readFileCached(file)
                .then(function(contents) {
                    defineModule(toModuleName(file), contents);
                });
        }));
    }

    function addShims() {
        _.each(shims, function(globalName, moduleName) {
            defineModule(moduleName, 'module.exports = window.'+globalName+';');
        });
    }

    function defineModule(moduleName, contents) {
        moduleDefinitions.push({
            name: moduleName,
            contents: contents
        });
    }

    function compileModuleDefinitions() {
        var contents = moduleDefinitions
            .sort(function(a, b) {
                return a.name.localeCompare(b.name);
            })
            .reduce(function(contents, item, index) {
                return contents + "bbDefine('"+item.name+"', function(module, exports, require) {\n"+item.contents+"\n});\n\n";
            }, '');
        if (self.injectHelpers) {
            contents = self.helpersJs + '\n\n' + contents;
        }
        output.push({
            priority: 'a',
            contents: contents
        });
    }

    function compileLegacyFiles() {
        return Promise.all(legacyFiles.map(function(file, index) {
            return readFileCached(file)
                .then(function(contents) {
                    output.push({
                        priority: 'b-' + String('00000' + index).slice(-5),
                        contents: contents
                    });
                });
        }));
    }

    function readFileCached(file) {
        return stat(path.join(srcDir, file))
            .then(function(statResult) {
                var statsHash = helpers.hashStats(statResult, file);
                var promise = self.cache.readFile[statsHash];
                if (!promise) {
                    promise = self.cache.readFile[statsHash] = readFileFromFs(file);
                }
                newCache.readFile[statsHash] = promise;
                return promise;
            });
    }

    function readFileFromFs(file) {
        return readFile(path.join(srcDir, file))
            .then(function(contents) {
                contents = contents.toString();
                var extension = path.extname(file);

                switch (extension) {
                    case '.js':
                        contents = wrapJs(contents, file, wrapInEval);
                        break;
                    case '.json':
                        contents = 'module.exports = '+contents+';';
                        break;
                }

                return contents;
            });
    }

    function mkOutputDir() {
        return mkdirp(path.dirname(path.join(destDir, outputFile)));
    }

    function saveOutputFile() {
        var contents = output
            .sort(function(a, b) {
                return a.priority.localeCompare(b.priority);
            })
            .reduce(function(contents, item) {
                return contents + item.contents + '\n\n';
            }, '');
        return writeFile(path.join(destDir, outputFile), contents);
    }

    function cleanup() {
        self.cache = newCache;
    }

    function getBowerConfigCached(dir) {
        var promise = self.cache.bower[dir];
        if (!promise) {
            promise = self.cache.bower[dir] = getBowerConfig(dir);
        }
        newCache.bower[dir] = promise;
        return promise;
    }

    function getBowerConfig(dir) {
        var file = path.join(srcDir, dir, 'bower.json');
        return readFile(file)
            //Load bower.json
            .then(function(json) {
                try {
                    return JSON.parse(json);
                } catch (e) {
                    throw new Error('Could not parse '+file+': '+e.message);
                }
            }, function(e) {
                if (e.cause && e.cause.code === 'ENOENT') {
                    return {};
                } else {
                    throw e;
                }
            })
            //Extract billy-builder config
            .then(function(bower) {
                var config = bower['billy-builder'] || {};

                config.main = bower.main;

                if (!config.main) {
                    var options = [
                        bower.name+'js',
                        'index.js'
                    ];
                    for (var i = 0; i < options.length; i++) {
                        if (fs.existsSync(path.join(dir, options[i]))) {
                            config.main = options[i];
                            break;
                        }
                    }
                }

                if (config.main) {
                    if (config.main instanceof Array) {
                        config.main = config.main[0];
                    }
                    //Remove .js suffix
                    config.main = config.main.replace(/\.js$/, '');
                }

                //Fix include so they can be used by glob
                config.include = config.include || [];
                if (!(config.include instanceof Array)) {
                    config.include = [config.include];
                }

                return config;
            });
    }
};

function wrapJs(contents, file, wrapInEval) {
    if (wrapInEval) {
        return 'eval("'+jsStringEscape(contents)+'//# sourceURL='+jsStringEscape(file)+'");';
    } else {
        return contents;
    }
}

function toModuleName(file) {
    return file.replace(/\.[^\.]*$/, '');
}

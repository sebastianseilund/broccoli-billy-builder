broccoli-billy-builder
======================

A "billy-builder flavored" CommonJS module concatenator for [Broccoli](github.com/broccolijs/broccoli).

We use this module in Billy's Billing for legacy reasons until we one day
hopefully can transition 100% to ember-cli.


## Installation

```
npm install --save-dev broccoli-billy-builder
```


## Usage

```
var tree = billyBuilder(inputTree[, options]);
```

Example:

```javascript
var billyBuilder = require('broccoli-billy-builder');

var isProduction = false;

var app = pickFiles('app', {
    srcDir: '/',
    destDir: '/my-project'
});

var appAndDependencies = mergeTrees(app, 'vendor');

var appJs = billyBuilder(appAndDependencies, {
    outputFile: 'assets/app.js',
    wrapInEval: !isProduction,
    modules: {
        'my-pr' {
            include: ['/']
        },
        'ember-popover': true,
        'batmask': true
    },
    legacyFiles: [
        'jquery/jquery.js',
        'handlebars/handlebars.js',
        isProduction ? 'ember/ember.min.js' : 'ember/ember.js'
    ],
    shims: {
        'jquery': '$',
        'handlebars': 'Handlebars',
        'ember': 'Ember'
    }
});
```


## Options

- `outputFile` **required**: The file to write the compiled modules to.
- `injectHelpers`: Whether the `bbRequire` and `bbDefine` methods should be included in the bundle. If you have multiple bundles, you should only leave this flag `true` for the first js file you are including in your html page. Defaults to `true`.
- `wrapInEval`: Whether each module should be wrapped in `eval` to enable source maps. Defaults to `true`.
- `modules`: A hash of module name as key (corresponds to the directory inside the input tree) and either `true` or an options hash as value. `true` means no extra options - use the ones defined in the module's `bower.json`. The options hash can contain the following properties:
  - `main`: The path to the module to return when requiring the module's name from another module. The `main` file is automatically included in the bundle.
  - `include`: An array of directories to search for source files to include in the bundle. All `.js` and `.json` files within these directories will be included.
- `legacyFiles`: An array of files inside the input tree that should be directly appended to the bundle, i.e. not wrapped inside modules. This is useful for 3rd party libraries such as jQuery and Ember.js.
- `shims`: A hash of module names that should resolve to global properties on `window`. This can make it possible to `require('jquery')` from inside other modules, and get back `window.$`.

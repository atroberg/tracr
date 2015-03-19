var gulp = require('gulp');
var sass = require('gulp-sass');
var watch = require('gulp-watch');
var wrap = require('gulp-wrap');
var concat = require('gulp-concat');
var declare = require('gulp-declare');
var handlebars = require('gulp-handlebars');
var browserify = require('gulp-browserify');
var jshint = require('gulp-jshint');
var jscs = require('gulp-jscs');
var stylish = require('jshint-stylish');

var sassDir = './scss/*.scss';
var handlebarsDir = 'templates/*.hbs';
var jsFiles = ['*.js'];

gulp.task('sass', function() {
    gulp.src(sassDir)
    .pipe(sass())
    .pipe(gulp.dest('./dist/css'));
});

gulp.task('watch', function() {
    gulp.watch(sassDir, ['sass']);
    gulp.watch(handlebarsDir, ['templates']);
});

gulp.task('templates', function() {
    // Load templates from the templates/ folder relative to where gulp was executed
    gulp.src(handlebarsDir)
    // Compile each Handlebars template source file to a template function
    .pipe(handlebars())
    // Wrap each template function in a call to Handlebars.template
    .pipe(wrap('Handlebars.template(<%= contents %>)'))
    // Declare template functions as properties and sub-properties of exports
    .pipe(declare({
        root: 'window.tracr.templates',
        noRedeclare: true, // Avoid duplicate declarations
        processName: function(filePath) {
            // Allow nesting based on path using gulp-declare's processNameByPath()
            // You can remove this option completely if you aren't using nested folders
            // Drop the templates/ folder from the namespace path by removing it from the filePath
            return declare.processNameByPath(filePath.replace('templates/', ''));
        }
    }))
    // Concatenate down to a single file
    .pipe(concat('templates.js'))
    // Add the Handlebars module in the final output
    .pipe(wrap('if(!window.tracr){window.tracr={templates:{}};} ' +
    'var Handlebars = require("handlebars");\n <%= contents %>'))
    .pipe(browserify())
    // WRite the output into the templates folder
    .pipe(gulp.dest('dist/'));
});

gulp.task('jscs', function() {
    return gulp.src(jsFiles)
    .pipe(jscs({
        configPath: '../.jscsrc'
    }));
});

gulp.task('jshint', function() {
    return gulp.src(jsFiles)
    .pipe(jshint())
    .pipe(jshint.reporter(stylish));
});

gulp.task('lint', ['jscs', 'jshint']);

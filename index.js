/**
 * BRSOLAB <contact@brsolab.com> (brsolab.com)
 * MIT Licence.
 */
'use strict';

const	fs				= require('fs'),
		OS_TMP_DIR		= require('os-tmpdir')(),
		{spawn}			= require('brsolab-process'),
		PATH			= require('path'),

		DFLT_PREFIX		= 'tmp-',
		DFLT_SUFFIX		= '.tmp',
		DFLT_FILE_MODE	= 0o600,
		DFLT_DIR_MODE	= 0o700,
		CREATE_FLAGS	= 'wx+',
		RANDOM_FACT		= 4503599627370496, // 2**52, need this to remove float point in "Math.random()"
		MAX_TRIES		= 100, 		// max tries count to create the tmp file or directory
		KEEP_FD			= false, 	// keep file descriptor open, default to false
		EMPTY_OBJ		= {},
		EXEC_TIMEOUT	= 500, // default timeout
		IS_WIN			= process.platform === 'win32'; // is windows or posix
/**
 * Create temp or unique file
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
module.exports.file	= async function(options){
	// prepare vars
		if(!options)
			options	= EMPTY_OBJ;
		var dirPath	= options.dir || OS_TMP_DIR,
			prefix	= options.prefix || DFLT_PREFIX,
			suffix	= options.suffix || DFLT_SUFFIX,
			mode	= options.mode || DFLT_FILE_MODE,
			tries	= 0,
			keepFD	= options.keepFD || KEEP_FD,
			path, fdtr;
	return new Promise((resolve, reject) => {
		// create file
		var createFx= (() => {
			path	= PATH.join(dirPath, prefix + _rand() + suffix);
			fs.open(path, CREATE_FLAGS, mode, (err, fd) => {
				if(err){
					if(err.code === 'EEXIST' && ++tries <= MAX_TRIES)
						createFx();
					else if(err.code === 'ENOENT') // folder not exists, create it
						spawn('mkdir', ['-p', PATH.normalize(dirPath)], {timeout:EXEC_TIMEOUT})
							.then(createFx)
							.catch(reject);
					else reject(err);
				}else{
					// file descriptor
					fdtr	= new fWrapper(fd, path);
					if(keepFD) resolve(fdtr);
					else{
						fdtr.close()
							.then(() => { resolve(fdtr) })
							.catch(err => { reject(err) });
					}
				}
			});
		});
		createFx();
	});
};

/**
 * create temp folder
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
module.exports.dir	= async function(options){
	// prepare vars
		if(!options)
			options	= EMPTY_OBJ;
		var dirPath	= options.dir || OS_TMP_DIR,
			prefix	= options.prefix || DFLT_PREFIX,
			suffix	= options.suffix || DFLT_SUFFIX,
			mode	= options.mode || DFLT_DIR_MODE,
			tries	= 0,
			path;
	// prepare dir
		if(dirPath.charAt(dirPath.length - 1) != '/') dirPath += '/';
	return new Promise((resolve, reject) => {
		// create file
		var createFx= (() => {
			path	= dirPath + prefix + _rand() + suffix + '/';
			fs.mkdir(path, mode, err => {
				if(err){
					if(err.code === 'EEXIST' && ++tries <= MAX_TRIES)
						createFx();
					else reject(err);
				}else resolve(new dWrapper(path));
			});
		});
		createFx();
	});
};

/** generate random string */
function _rand(){ return process.pid + Math.random().toString(36).substr(2);}

/** remove file or directory recursively */
var _rmFile, _rmDir;
if(IS_WIN){ // WINDOWS
	_rmFile	= function(path){ return spawn('del', [path]); };
	_rmDir	= function(path){ return spawn('rmdir', ['/S', '/q', path]); };
} else { //POSIX
	_rmFile	= function(path){ return spawn('rm', [path]); };
	_rmDir	= function(path){ return spawn('rm', ['-r', path]); };
}

/** file descriptor prototype */
function fWrapper(fd, path, type){
	this.fd	= fd;
	Object.defineProperties(this, {
		path: { value : path },
		type: { value : type }
	});
}

/** cleanup the tmp file or directory */
fWrapper.prototype.cleanup	= function(){
	return this.close().then(() => _rmFile(this.path));
};

/** close file descriptor */
fWrapper.prototype.close	= function(){
	if(this.fd)
		return new Promise((resolve, reject) => {
			fs.close(this.fd, err => {
				if(err && err.code != 'EBADF' && err.code != 'ENOENT') reject(err);
				else{
					this.fd = null;
					resolve();
				}
			});
		});
	else return Promise.resolve();
};

/** directory discriptor prototype */
function dWrapper(path){
	Object.defineProperty(this, 'path', { value: path });
}

/** cleanup folder */
dWrapper.prototype.cleanup	= function(){
	return _rmDir(this.path);
};
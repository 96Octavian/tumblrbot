var winston = require( 'winston' );

var logger = winston.createLogger( {
	transports: [
		new winston.transports.File( {
			level: 'info',
			filename: './tumblrbot.log',
			handleExceptions: true,
			json: false,
			maxsize: 5242880, //5MB
			maxFiles: 5,
			colorize: true
		} ),
		new winston.transports.Console( {
			level: 'debug',
			handleExceptions: true,
			json: false,
			colorize: true
		} )
	],
	exitOnError: false
} );

module.exports = logger;
module.exports.stream = {
	write: function ( message, encoding ) {
		logger.info( message );
	}
};

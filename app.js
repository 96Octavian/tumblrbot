const Telegraf = require( 'telegraf' );
var tumblr = require( 'tumblr.js' );
var fs = require( 'fs' );

var logger = require( './logger' );
var AWS = require( 'aws-sdk' );

const s3 = new AWS.S3();

var authenticating = {};

/*
Missing chat posts
*/

const BOT_TOKEN = process.env.TOKEN;

const bot = new Telegraf( BOT_TOKEN );
const { Extra, session, Markup } = Telegraf;

bot.use( session() );
//Uncomment once if a message crashes the bot
//bot.on('message', ctx => console.log('Message'));

/*
AUTHENTICATION SECTION
*/

var consumer_key = function ( ctx ) {
	logger.debug( 'consumer_key from', ctx.chat.id );
	logger.info( 'Received consumer_key' );
	ctx.session.clients.consumer_key = ctx.message.text.replace( '/consumer_key ', '' );
	return ctx.reply( ctx.session.clients );
};
var consumer_secret = function ( ctx ) {
	logger.debug( 'consumer_secret from', ctx.chat.id );
	logger.info( 'Received consumer_secret' );
	ctx.session.clients.consumer_secret = ctx.message.text.replace( '/consumer_secret ', '' );
	return ctx.reply( ctx.session.clients );
};
var token_secret = function ( ctx ) {
	logger.debug( 'token_secret from', ctx.chat.id );
	logger.info( 'Received token_secret' );
	ctx.session.clients.token_secret = ctx.message.text.replace( '/token_secret ', '' );
	return ctx.reply( ctx.session.clients );
};
var token = function ( ctx ) {
	logger.debug( 'token from', ctx.chat.id );
	logger.info( 'Received token' );
	ctx.session.clients.token = ctx.message.text.replace( '/token ', '' );
	return ctx.reply( ctx.session.clients );
};
bot.command( 'login', ctx => {
	logger.debug( '\'/login\' from', ctx.chat.id );
	let arr = authenticating[ctx.chat.id];
	ctx.session.client = tumblr.createClient( arr );
	identity( ctx );
} );
bot.command( 'allset', ctx => {
	logger.debug( '\'/allset\' from', ctx.chat.id );
	var firstJSON = ctx.message.text.replace( '/allset', '' );
	if ( !firstJSON.trim() ) {
		logger.warn( 'No oAuth key specified' );
		ctx.reply( 'No oAuth key specified' );
	}
	else {
		var fixedJSON = firstJSON.replace( /(\r\n|\n|\r)/gm, "" ).replace( /'/g, "\"" );
		fixedJSON = fixedJSON.replace( /(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2": ' );
		logger.debug( fixedJSON );
		let arr = JSON.parse( fixedJSON );
		ctx.session.client = tumblr.createClient( arr );
		identity( ctx );
		authenticating[ctx.chat.id] = arr;
		upload_auth();
		ctx.reply( 'Credential recorded, testing...' );
	}
} );
var set = function ( ctx ) {
	logger.debug( '\'/set\' from', ctx.chat.id );
	if ( Object.keys( ctx.session.clients ).length === 4 ) {
		ctx.session.client = tumblr.createClient( ctx.session.clients );
		identity( ctx );
		authenticating[ctx.chat.id] = ctx.session.clients;
		upload_auth();
		return ctx.reply( 'Credential recorded, testing...' );
	}
	else {
		logger.error( 'Client credentials not completely specified' );
		ctx.reply( 'Credentials incomplete' );
	}
};
bot.command( ['consumer_secret', 'consumer_key', 'token', 'token_secret', 'set'], ctx => {
	ctx.session.clients = ctx.session.clients || {};
	var text = ctx.message.text;
	if ( text === '/set' ) {
		set( ctx );
	}
	else if ( text.substring( 0, 14 ) == '/consumer_key ' ) {
		consumer_key( ctx );
	}
	else if ( text.substring( 0, 17 ) === '/consumer_secret ' ) {
		consumer_secret( ctx );
	}
	else if ( text.substring( 0, 7 ) === '/token ' ) {
		token( ctx );
	}
	else if ( text.substring( 0, 14 ) === '/token_secret ' ) {
		token_secret( ctx );
	}
} );
var identity = function ( ctx ) {
	ctx.session.names = [];
	ctx.session.client.userInfo( function ( err, data ) {
		if ( err ) {
			delete authenticating[ctx.chat.id];
			upload_auth();
			ctx.reply( 'Wrong credentials, removed' );
			return;
		}
		let msg = 'Username: ' + data.user.name + '\nAvailable blogs: ';
		ctx.session.name = ctx.session.name || data.user.blogs[0].name;
		var i;
		for ( i in data.user.blogs ) {
			msg += '\n' + data.user.blogs[i].name;
			ctx.session.names.push( data.user.blogs[i].name );
		}
		msg = '<i>Authenticated</i>\n' + msg;
		return ctx.reply( msg, { parse_mode: 'HTML' } );
	} );
};
bot.command( 'me', ctx => {
	logger.debug( '\'/me\' from', ctx.chat.id );
	if ( typeof ctx.session.client !== 'undefined' ) {
		identity( ctx );
	}
	else {
		ctx.reply( 'You are not logged in' );
		logger.warn( 'User', ctx.chat.id, 'not logged in' );
	}
} );
//Choose the destination blog
var blog = function ( ctx ) {
	if ( typeof ctx.session.names !== 'undefined' && ctx.session.names.length !== 0 ) {
		let buttons = [];
		for ( let e in ctx.session.names ) {
			buttons.push( [Markup.callbackButton( ctx.session.names[e], ctx.session.names[e] )] );
		}
		return ctx.reply( 'Choose your blog', Extra.HTML().markup(
			Markup.inlineKeyboard( buttons ) ) );
	}
	else {
		logger.warn( 'User', ctx.chat.id, 'not logged in' );
		ctx.reply( 'You are not logged in' );
	}
};
bot.command( 'blog', ctx => {
	logger.debug( '\'/blog\' from', ctx.chat.id );
	if ( ctx.message.chat.type !== 'private' ) {
		ctx.getChatAdministrators()
			.then( function ( value ) {
				for ( let i in value ) {
					if ( ctx.from.id === value[i]['user']['id'] ) {
						return blog( ctx );
					}
				}
				ctx.reply( 'You are not an Admin of this group' );
			}, function ( error ) {
				return logger.debug( error );
			} );
	}
	else {
		blog( ctx );
	}
} );
bot.action( /.+/, ( ctx ) => {
	ctx.session.name = ctx.match[0];
	//ctx.answerCallbackQuery( ctx.match[0] + ' set as destination' )
	ctx.answerCbQuery( ctx.match[0] + ' set as destination' );
	ctx.editMessageText( ctx.match[0] + ' set as destination' );
	logger.info( ctx.match[0], 'set as destination for', ctx.chat.id );
} );

/*
TEXT HANDLING SECTION
*/

var texter = function ( ctx ) {
	ctx.session.post['type'] = 'text';
	ctx.session.post['body'] = ctx.message.text.replace( '/text ', '' );
	ctx.reply( 'Post body set' );
	logger.info( 'Post body set' );
};
var titler = function ( ctx ) {
	ctx.session.post['title'] = ctx.message.text.replace( '/title ', '' );
	ctx.reply( 'Post title set' );
	logger.info( 'Post title set' );
};
var poster = function ( ctx ) {
	if ( ctx.session.post.type ) {
		if ( ctx.session.post.type === 'text' && !ctx.session.post.body ) {
			ctx.reply( 'No post body set' );
			logger.info( 'No post body set' );
			return;
		}
		if ( ctx.session.post.type === 'photo' && !ctx.session.post.source ) {
			ctx.reply( 'No image set' );
			logger.info( 'No image set' );
			return;
		}
		ctx.session.client.createPost( ctx.session.name, ctx.session.post, function ( err, data ) {
			if ( err ) {
				logger.error( err );
				ctx.reply( 'Error: no post created' );
			}
			else {
				ctx.session.state = ctx.session.state || 'published';
				logger.info( 'New ' + ctx.session.state + ' post created' );
				ctx.reply( 'Post!\nLink: http://' + ctx.session.name + '.tumblr.com/post/' + data.id );
				ctx.session.post = {};
			}
		} );
	}
	else {
		logger.debug( 'Post action requested but no post type set' );
		ctx.reply( 'No post type set' );
	}
};
var tagger = function ( ctx ) {
	ctx.session.post['tags'] = ctx.message.text.replace( '/tags ', '' );
	ctx.reply( 'Tags set' );
	logger.info( 'Tags set' );
};
var stater = function ( ctx ) {
	if ( ['published', 'draft', 'queue', 'private'].indexOf( ctx.message.text.replace( '/state ', '' ) ) !== -1 ) {
		ctx.session.post['state'] = ctx.message.text.replace( '/state ', '' );
		ctx.reply( 'State set' );
		logger.info( 'State set' );
	}
	else {
		ctx.reply( 'State must be one of published, draft, queue, private' );
		logger.info( 'Unrecognize state \'' + ctx.message.text.replace( '/state ', '' ) + '\'' );
	}
};
var formatter = function ( ctx ) {
	if ( ['html', 'markdown'].indexOf( ctx.message.text.replace( '/format ', '' ) ) !== -1 ) {
		ctx.session.post['format'] = ctx.message.text.replace( '/format ', '' );
		ctx.reply( 'Format set' );
		logger.info( 'Format set' );
	}
	else {
		ctx.reply( 'Unrecognized format' );
		logger.info( 'Unrecognized format' );
	}
};

/*
PHOTO HANDLING SECTION
*/

var downloadPhoto = function ( ctx, id ) {
	return bot.getFileLink( ctx.message.photo[id].file_id )
		.then( function ( value ) {
			ctx.session.post['source'] = value;
			logger.info( 'Image source set' );
			ctx.reply( 'Image source set' );
			logger.debug( value );
		}, function ( error ) {
			logger.info( 'Error while getting photo URL' );
			ctx.reply( 'No photo received' );
		} );
};
bot.on( 'photo', ctx => {
	logger.info( 'Received photo' );
	ctx.session.post = ctx.session.post || {};
	ctx.session.post['type'] = 'photo';
	if ( ctx.message.caption ) { ctx.session.post['caption'] = ctx.message.caption; ctx.reply( 'Caption set' ); logger.info( 'Caption set' ) }
	var id = ctx.message.photo.length - 1;
	downloadPhoto( ctx, id );
} );
var captioner = function ( ctx ) {
	ctx.session.post['caption'] = ctx.message.text.replace( '/caption ', '' );
	ctx.session.post['type'] = 'photo';
	ctx.reply( 'Caption set' );
	logger.info( 'Caption set' );
};
var linker = function ( ctx ) {
	ctx.session.post['link'] = ctx.message.text.replace( '/link ', '' );
	ctx.session.post['type'] = 'photo';
	ctx.reply( 'Link set' );
	logger.info( 'Link set' );
};

/*
QUOTES HANDLING SECTION
*/

var quoter = function ( ctx ) {
	ctx.session.post['quote'] = ctx.message.text.replace( '/quote ', '' );
	ctx.session.post['type'] = 'quote';
	ctx.reply( 'Quote text set' );
	logger.info( 'Quote text set' );
};
var sourcer = function ( ctx ) {
	ctx.session.post['type'] = 'quote';
	ctx.session.post['source'] = ctx.message.text.replace( '/source ', '' );
	ctx.reply( 'Quote source set' );
	logger.info( 'Quote source set' );
};

/*
LINK HANDLING SECTION
*/

var urler = function ( ctx ) {
	ctx.session.post['url'] = ctx.message.text.replace( '/url ', '' );
	ctx.session.post['type'] = 'link';
	ctx.reply( 'Link URL set' );
	logger.info( 'Link URL text set' );
};
var descriptioner = function ( ctx ) {
	ctx.session.post['description'] = ctx.message.text.replace( '/description ', '' );
	ctx.session.post['type'] = 'link';
	ctx.reply( 'Link description set' );
	logger.info( 'Link description set' );
};

var porter = function ( ctx ) {
	if ( typeof ctx.session.client === 'undefined' ) {
		logger.warn( 'User', ctx.chat.id, 'has not yet logged in' );
		ctx.reply( 'You have to /login first or set your credentials' );
	}
	else if ( typeof ctx.session.name === 'undefined' ) {
		logger.warn( 'User', ctx.chat.id, 'has not yet selected a main blog' );
		ctx.reply( 'You have to select your destination using the /blog command' );
	}
	else {
		ctx.session.post = ctx.session.post || {};
		var text = ctx.message.text;
		if ( text === '/post' ) {
			poster( ctx );
		}
		else if ( text.substring( 0, 6 ) === '/text ' ) {
			texter( ctx );
		}
		else if ( text.substring( 0, 7 ) === '/title ' ) {
			titler( ctx );
		}
		else if ( text === '/id' ) {
			ctx.reply( ctx.chat.id );
		}
		else if ( text.substring( 0, 6 ) === '/tags ' ) {
			tagger( ctx );
		}
		else if ( text.substring( 0, 7 ) === '/state ' ) {
			stater( ctx );
		}
		else if ( text.substring( 0, 8 ) === '/format ' ) {
			formatter( ctx );
		}
		else if ( text.substring( 0, 5 ) === '/url ' ) {
			urler( ctx );
		}
		else if ( text.substring( 0, 13 ) === '/description ' ) {
			descriptioner( ctx );
		}
		if ( text.substring( 0, 7 ) === '/quote ' ) {
			quoter( ctx );
		}
		else if ( text.substring( 0, 8 ) === '/source ' ) {
			sourcer( ctx );
		}
		if ( text.substring( 0, 9 ) === '/caption ' ) {
			captioner( ctx );
		}
		else if ( text.substring( 0, 6 ) === '/link ' ) {
			linker( ctx );
		}
		else if ( text === '/delete' ) {
			ctx.session.post = {};
			ctx.reply( 'Post deleted. No post set' );
			logger.info( 'Post deleted. No post set' );
		}
	}
};
bot.command( ['id', 'title', 'text', 'post', 'tags', 'state', 'format', 'url', 'description', 'quote', 'source', 'caption', 'link', 'delete'], ( ctx ) => { logger.debug( '\'', ctx.message.text, '\' from', ctx.chat.id ); porter( ctx ) } );

bot.command( 'help', ctx => {
	var msg = 'If you need to start from scratch, please use /start to set\
  an oAuth key for your account\n\
  /allset {Your oAuth credentials}\n\
  /login to authenticate if you\'ve already sent oAuth\n\
  /blog to choose where to post (in groups only administrators can set this)\n\
  <i>All post types</i>\n\
  /state: the state of the post. Specify one of the following:  published, draft, queue, private\n\
  /tags: comma-separated tags for this post\n\
  /format: sets the format type of post. Supported formats are: html & markdown\n\
  /delete: start from scratch\n\
  <i>Text posts</i>\n\
  /title: the optional title of the post\n\
  /text: the full post body, HTML allowed\n\
  <i>Photo posts</i>\n\
  Send a photo to set the photo source\n\
  /caption: the user-supplied caption\n\
  /link: the \'click-through URL\' for the photo\n\
  <i>Quote posts</i>\n\
  /quote: the full text of the quote\n\
  /source: cited source\n\
  <i>Link posts</i>\n\
  /title: the title of the page the link points to\n\
  /url: the link\n\
  /description: a user-supplied description\n\
  That\' all folks! Have fun';
	ctx.reply( msg, { parse_mode: 'HTML' } );
} );

bot.command( 'start', ctx => {
	logger.debug( '\'/start\' from', ctx.chat.id );
	var msg = 'Hi! Welcome aboard the Tumblr posting bot! To get things up, you need to provide me\
  with your tumblr oAuth key (/oAuth if you don\'t know how to find it) using\
  \n<code>/allset {your oAuth key}</code>\n\
  If you already sent that, simply use /login.\n\
  Almost done! Use /blog to choose one of your blogs as destination.\n\
  To creat a post simply send the text you wish: for example, using\n\
  <code>/text I\'m sending messagest to my blog!</code>\n\
  <code>/title Awesome</code>\n\
  <code>/tags awesome,telegram,telegramBot,tumblr,nerd</code>\n\
  will create a text post with tags.\n\
  Use /help for a more detailed command list\n\
  (PS: i\'d suggest you edit your message containing the oAuth key immediately once sent, if your are in a group)';
	ctx.reply( msg, { parse_mode: 'HTML' } );
} );
bot.command( 'oAuth', ctx => ctx.reply( 'http://telegra.ph/Getting-an-oAuth-key-12-07' ) );

bot.telegram.getMe().then( ( botInfo ) => {
	bot.options.username = botInfo.username;
	logger.info( 'Started bot ' + bot.options.username );
} );

var download_auth = function () {
	var params = { Bucket: "tumblr.auth", Key: "auth.json" };

	s3.getObject( params, function ( err, data ) {
		if ( err ) logger.error( "S3 not responding" );
		else {
			logger.info( "Data contains:\n" + ( data.Body ).toString() );
			authenticating = JSON.parse( ( data.Body ).toString() );
			logger.info( "Authentication contains:\n%j", authenticating );
		}
	} );
};

var upload_auth = function () {

	let params = { Body: JSON.stringify(authenticating), Bucket: "tumblr.auth", Key: "auth.json" };

	s3.putObject( params, function ( err, data ) {
		if ( err ) logger.error( err.code, "-", err.message );
		else logger.info( "Uploaded:\n%j", data );
	} );
	// altrimenti tutto ok
	// Se ci sono errori da S3 invia un messaggio dicendo che il DB non risponde
};

/* AWS Lambda handler function */
exports.handler = ( event, context, callback ) => {

	download_auth();
	const tmp = JSON.parse( event.body ); // get data passed to us
	bot.handleUpdate( tmp ); // make Telegraf process that data
	return callback( null, { // return something for webhook, so it doesn't try to send same stuff again
		statusCode: 200,
		body: '',
	} );
};
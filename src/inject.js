function getSelectedText(el) {
	
	if (el && typeof el.selectionStart !== 'undefined') {
		let start = el.selectionStart;
		let finish = el.selectionEnd;
		return el.value.substring(start, finish);
	} else
		return window.getSelection().toString();

}

// update searchTerms when selecting text and quickMenuObject.locked = true
document.addEventListener("selectionchange", (ev) => {
	if ( quickMenuObject ) quickMenuObject.lastSelectTime = Date.now();
	
	browser.runtime.sendMessage({action: "updateSearchTerms", searchTerms: window.getSelection().toString()});
});

// selectionchange handler for input nodes
for (let el of document.querySelectorAll("input[type='text'], input[type='search'], textarea, [contenteditable='true']")) {
	el.addEventListener('mouseup', (e) => {
		let text = getSelectedText(e.target)
		if (text)
			browser.runtime.sendMessage({action: "updateSearchTerms", searchTerms: text});
	});
}

// Relabel context menu root on mousedown to fire before oncontextmenu
window.addEventListener('mousedown', (e) => {

	if ( e.which !== 3 ) return false;

	let searchTerms = getSelectedText(e.target) || linkOrImage(e.target, e);

	browser.runtime.sendMessage({action: 'updateContextMenu', searchTerms: searchTerms});
});

// https://stackoverflow.com/a/1045012
function offset(elem) {
    if(!elem) elem = this;

    var x = elem.offsetLeft;
    var y = elem.offsetTop;

    while (elem = elem.offsetParent) {
        x += elem.offsetLeft;
        y += elem.offsetTop;
    }

    return { left: x, top: y };
}

function repositionOffscreenElement( element ) {
	
	// move if offscreen
	let scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
	let scrollbarHeight = window.innerHeight - document.documentElement.clientHeight;
	
	let rect = element.getBoundingClientRect();

	if ( rect.bottom > window.innerHeight ) {
		if ( element.style.bottom )
			element.style.bottom = 0 + "px";
		else 
			element.style.top = (window.innerHeight - rect.height) + "px";
	}

	if (rect.top < 0) {
		if ( element.style.bottom ) 
			element.style.bottom = (window.innerHeight - rect.height) + "px";
		else
			element.style.top = 0 + "px";
	}
	
	if ( rect.right > window.innerWidth ) {
		if ( element.style.right )
			element.style.right = 0 + "px";
		else 
			element.style.left = (window.innerWidth - rect.width) + "px";
	}
	
	if ( rect.left < 0 ) {
		if ( element.style.right ) 
			element.style.right = (window.innerWidth - rect.width) + "px";
		else
			element.style.left = 0 + "px";
	}
	
	// if (rect.y + rect.height > window.innerHeight) 
		// element.style.top = parseFloat(element.style.top) - ((rect.y + rect.height) - window.innerHeight) - scrollbarHeight + "px";
	
	// if (rect.left < 0) 
		// element.style.left = (parseFloat(element.style.left) - rect.x) + "px";
	
	// if (rect.x + rect.width > window.innerWidth) 
		// element.style.left = parseFloat(element.style.left) - ((rect.x + rect.width) - window.innerWidth) - scrollbarWidth + "px";

}

function getLink(el, e) {

	let a = el.closest('a');
	
	if ( !a ) return "";
	
	let method = userOptions.contextMenuSearchLinksAs;
	
	if ( e && e.ctrlKey ) method = method === 'url' ? 'text' : 'url';

	return method === 'url' ? a.href || a.innerText : a.innerText || a.href;
}

function getImage(el, e) {
	
	if ( el.innerText ) return false;
	
	if ( el.tagName === 'IMG' ) return el.src;
	
	let style = window.getComputedStyle(el, false);
	
	let backgroundImage = style.backgroundImage;

	if ( ! /^url\(/.test(backgroundImage) ) return false;

	return backgroundImage.slice(4, -1).replace(/"/g, "")
}

function addResizeWidget(el, options) {
	
	let o = {
		tileSize: {},
		deadzone: 10,
		onDragStart: function() {},
		onDrag: function() {},
		onDrop: function() {},
		columns: 0,
		rows: 0
	}
	
	o = Object.assign(o, options);

	let resizeWidget = el.resizeWidget;

	// overlay a div to capture mouse events over els
	let overDiv = document.createElement('div');
	overDiv.className = "CS_overDiv";
	overDiv.style = "cursor:nwse-resize";
	
	// build resize widget once per quick menu open
	if ( !resizeWidget ) {
		
		let startCoords, endCoords, endSize;
		
		resizeWidget = document.createElement('div');
		resizeWidget.className = 'CS_resizeWidget';

		document.body.appendChild(resizeWidget);
		el.resizeWidget = resizeWidget;

		resizeWidget.addEventListener('mousedown', function elementResize(e) {

			let startSize = {columns: o.columns, rows: o.rows};

			document.body.appendChild(overDiv);

			el.style.transition = 'none';
			el.style.borderWidth = '2px';
			el.style.borderStyle = 'dashed';
			
			resizeWidget.style.transition = 'none';

			// lower the quick menu in case zIndex = MAX
			el.style.zIndex = window.getComputedStyle(el).zIndex - 1;

			// match grid to tile size after scaling
			let stepX = el.getBoundingClientRect().width / el.offsetWidth * o.tileSize.width;
			let stepY = el.getBoundingClientRect().height / el.offsetHeight * o.tileSize.height;
			
			// initialize the coords with some offset for a deadzone
			startCoords = {x: e.clientX - o.deadzone, y: e.clientY - o.deadzone};

			document.addEventListener('mousemove', elementDrag);

			// track mod size to ignore repeat drag events
			let mostRecentModSize = {columns:0,rows:0};
			
			function elementDrag(_e) {
				endCoords = {x: _e.clientX, y: _e.clientY};

				let colsMod = Math.floor (( endCoords.x - startCoords.x ) / stepX);
				let rowsMod = Math.floor (( endCoords.y - startCoords.y ) / stepY);
				
				// size less than 1 do nothing
				if ( startSize.columns + colsMod <= 0 || startSize.rows + rowsMod <= 0 ) return;

				// ignore repeat drag events
				if ( mostRecentModSize.columns === colsMod && mostRecentModSize.rows === rowsMod )
					return;

				o.onDrag({
					columns: startSize.columns + colsMod,
					rows: startSize.rows + rowsMod,
					columnsOffset: colsMod,
					rowsOffset: rowsMod,
					xOffset: endCoords.x - startCoords.x,
					yOffset: endCoords.y - startCoords.y,
					endCoords: endCoords
					
				});
				
				mostRecentModSize = {columns: colsMod, rows: rowsMod};
			}
			
			document.addEventListener('mouseup', (_e) => {
				
				_e.stopImmediatePropagation();

				// clear overlay
				overDiv.parentNode.removeChild(overDiv);
				
				// clear resize styling
				el.style.transition = null;
				el.style.borderWidth = null;
				el.style.borderStyle = null;
				el.style.zIndex = null;
				
				resizeWidget.style.transition = null;
				
				o.onDrop(o);
				
				document.removeEventListener('mousemove', elementDrag);
			}, {once: true});
			
		});
	}
	
	// queue reposition for transitions
	el.addEventListener('transitionend', positionResizeWidget);

	function positionResizeWidget() {
		
		resizeWidget.style.top = null;
		resizeWidget.style.left = null;
		resizeWidget.style.right = null;
		resizeWidget.style.bottom = null;
		
		let w_rect = resizeWidget.getBoundingClientRect();

		let rect = el.getBoundingClientRect();
		
		let scale = rect.width / el.offsetWidth;
		
		let offset = 4 * scale;
		
		if ( el.style.left ) 
			resizeWidget.style.left = el.offsetLeft + rect.width - w_rect.width + offset + "px";
		if ( el.style.right )
			resizeWidget.style.right = parseFloat(el.style.right) - offset + "px";
		if ( el.style.top )
			resizeWidget.style.top = el.offsetTop + rect.height - w_rect.height + offset + "px";
		if ( el.style.bottom )
			resizeWidget.style.bottom = parseFloat(el.style.bottom) - offset + "px";
	}
	
	// set animation state
	if ( !userOptions.enableAnimations ) resizeWidget.style.setProperty('--user-transition', 'none');

	/* dnd resize end */	
	positionResizeWidget();
	
	return resizeWidget;
}

// set zoom attribute to be used for scaling objects
document.documentElement.style.setProperty('--cs-zoom', window.devicePixelRatio);

// apply global user styles for /^[\.|#]CS_/ matches in userStyles
browser.runtime.sendMessage({action: "getUserOptions"}).then( result => {
		
	let userOptions = result.userOptions;

	if ( userOptions.userStylesEnabled && userOptions.userStylesGlobal ) {
		
		let styleEl = document.createElement('style');
		
		styleEl.innerText = userOptions.userStylesGlobal;

		document.head.appendChild(styleEl);
	}
});



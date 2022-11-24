/** TESTING */

/** Boundary bit flags */
const Flags = Object.freeze({
	// for Boundary.side; magnitude matches DOM order
	/** Denotes a position before the opening boundary of a node (outside the node) */
	BEFORE_OPEN: 0b1,
	/** Denotes a position after the opening boundary of a node (inside the node) */
	AFTER_OPEN: 0b10,
	/** Denotes a position before the closing boundary of a node (inside the node) */
	BEFORE_CLOSE: 0b1000,
	/** Denotes a position after the closing boundary of a node (outside the node) */
	AFTER_CLOSE: 0b10000,

	// for filtering by Boundary.side
	/** Bitmask to filter any position */
	FILTER_ALL: 0b11011,
	/** Bitmask to filter positions relative to a node's opening boundary */
	FILTER_OPEN: 0b11,
	/** Bitmask to filter positions relative to a node's closing boundary */
	FILTER_CLOSE: 0b11000,
	/** Bitmask to filter positions before the opening or closing node boundary */
	FILTER_BEFORE: 0b1001,
	/** Bitmask to filter positions after the opening or closing node boundary */
	FILTER_AFTER: 0b10010,
	/** Bitmask to filter positions inside the reference node */
	FILTER_INSIDE: 0b1010,
	/** Bitmask to filter positions outside the reference node */
	FILTER_OUTSIDE: 0b10001,

	// for comparing positions relative to a boundary
	/** Used to indicate a Boundary that is before a node; `BEFORE_OPEN > POSITION_BEFORE` */
	POSITION_BEFORE: 0b0,
	/** Used to indicate a Boundary that is inside a node; `AFTER_OPEN > POSITION_INSIDE > BEFORE_CLOSE` */
	POSITION_INSIDE: 0b100,
	/** Used to indicate a Boundary that is after a node; `POSITION_AFTER > AFTER_CLOSE` */
	POSITION_AFTER: 0b100000
});

/**
 * Encodes a node boundary: a position inside the DOM tree, or what one might call an "anchor".
 * Every node has an opening and closing boundary; for HTML, this corresponds to the
 * opening/closing tag. A position is relative to one of these bounds. For example:
 * 	
 * ```html
 * A<span>B C</span>D
 * ```
 * 
 * Each of the letters gives a position relative to the `<span>` Node. To select which one to use,
 * provide a `side` flag to `Boundary`:
 * - A: `BEFORE_OPEN`
 * - B: `AFTER_OPEN`
 * - C: `BEFORE_CLOSE`
 * - D: `AFTER_CLOSE`
 * 
 * These are bit flags, so can use bitmasks for filtering. The flags are ordered numerically by
 * their DOM position, so you can do comparisons, e.g. `BEFORE_OPEN < AFTER_OPEN`.
 */
class Boundary{
	#node;
	#side;
	/** validate side flag */
	static #valid_side(b){
		return b == Flags.BEFORE_OPEN || b == Flags.AFTER_OPEN ||
			b == Flags.BEFORE_CLOSE || b == Flags.AFTER_CLOSE;
	}
	/** set node and side together */
	#set(node, side){
		this.#node = node;
		this.#side = side;
	}

	/**
	 * Create a node boundary; takes up to three arguments:
	 * @param {Boundary | [Node, Number] | [Node, Number, Number]} args one of three formats:
	 * 1. pass a `Boundary` to copy
	 * 2. pass a `Node` and one of BEFORE/AFTER_OPEN/CLOSE Flags
	 * 3. in the manner of Range/StaticRange interfaces, pass an anchor `Node`, an offset into that
	 *    anchor, and one of POSITION_BEFORE/AFTER, indicating which side of the anchor you wish
	 *    to get the boundary for
	 */
	constructor(...args){
		this.set(...args);
	}
	/** Update boundary values. Same arguments as the constructor */
	set(...args){
		// I've disabled input validation for now, since the node/boundary props are currently
		// directly accessable; so wouldn't be fully enforced anyways
		switch (args.length){
			case 1:
				const o = args[0];
				if (!(o instanceof Boundary))
					throw TypeError("expected Boundary for first arg");
				this.#set(o.#node, o.#side);
				break;
			case 2: {
				const [node, side] = args;
				if (!(node instanceof Node || node === null))
					throw TypeError("expected Node or null for first arg");
				if (!Boundary.#valid_side(side))
					throw TypeError("expected a side bit flag for second arg")
				this.#set(node, side);
				break;
			}
			case 3: {
				let [node, offset, position] = args;
				if (!(node instanceof Node))
					throw TypeError("expected Node for first arg");
				if (!Number.isInteger(offset))
					throw TypeError("expected integer for second arg")
				if (position != Flags.POSITION_BEFORE && position != Flags.POSITION_AFTER)
					throw TypeError("expected a position bit flag for third arg")
				const istxt = node instanceof CharacterData;
				if (istxt)
					this.#side = position ? Flags.AFTER_CLOSE : Flags.BEFORE_OPEN;
				else{
					// left/right side; edges switch to AFTER_OPEN/BEFORE_CLOSE
					if (position)
						this.#side = offset >= node.childNodes.length ? Flags.BEFORE_CLOSE : Flags.BEFORE_OPEN;
					else this.#side = offset <= 0 ? Flags.AFTER_OPEN : Flags.AFTER_CLOSE;
					// if we are referencing a child node
					if (this.#side & Flags.FILTER_OUTSIDE)
						node = node.childNodes[offset - !position];
				}
				this.#node = node;
				// For text, we first clamp outside, then we clamp again to match the desird `position`;
				// no way currently to do an "inclusive" boundary of a CharacterNode using this input syntax
				if (istxt)
					position ? this.next() : this.previous();
			} break;
			default:
				this.#set(null, Flags.BEFORE_OPEN);
				break;
		}
	}
	// Property access
	/** @returns {Node} node whose boundary we reference */
	get node(){ return this.#node; }
	set node(node){
		if (!(node instanceof Node || node === null))
			throw TypeError("node must be a Node or null");
		this.#node = node;
	}
	/** @returns {Number} bit flag giving which side of the node our boundary is for */
	get side(){ return this.#side; }
	set side(side){
		if (!Boundary.#valid_side(side))
			throw TypeError("invalid side bit flag");
		this.#side = side;
	}
	/** Copy this Boundary object */
	clone(){
		return new Boundary(this);
	}
	/** Convert to an anchor, in the manner of the builtin Range/StaticRange interface.
	 * @param {Boolean} text The Range interface switches to encoding text offsets for CharacterData
	 *  nodes, as children are disallowed for these node types. Thus, an anchor/boundary *inside* a
	 *  CharacterData node is not allowed for Range interface. Set this parameter to `true` to move
	 *  a boundary inside a CharacterData node to the nearest outside boundary.
	 * @returns {{node: Node, offset: Number}} node and offset inside that node
	 */
	toAnchor(text=true){
		if (!this.#node)
			throw Error("cannot convert null Boundary to anchor");
		let node = this.#node, offset = 0;
		// calculate offset by finding node's index in parent's child nodes
		if (this.#side & Flags.FILTER_OUTSIDE || (text && node instanceof CharacterData)){
			let child = node;
			node = node.parentNode;
			// Range offset indexes the previous side (so open boundaries are exclusive)
			if (this.#side & Flags.FILTER_OPEN)
				child = child.previousSibling;
			while (child !== null){
				child = child.previousSibling
				offset++;
			}
		}
		else if (this.#side == Flags.BEFORE_CLOSE)
			offset = node.childNodes.length;
		return {node, offset};
	}
	/** Compare relative position of two boundaries
	 * @param {Boundary} other boundary to compare with
	 * @returns one of the following:
	 * 	- `null` if the boundaries are from different DOM trees or the relative position can't be determined
	 * 	- `0` if they are equal (see also `isEqual()` method for a faster equality check)
	 * 	- `1` if this boundary is after `other`
	 *  - `-1` if this boundary is before `other`
	 * Note, two boundaries that are adjacent, but have differing nodes/boundaries are not
	 * considered "equal". They have an implicit side to them. Use `isAdjacent()` method to check for
	 * this case instead.
	 */
	compare(other){
		if (this.#node === other.#node)
			return Math.sign(this.#side - other.#side);
		if (this.#node && other.#node){
			const p = this.#node.compareDocumentPosition(other.#node);
			// handle contained/contains before preceding/following, since they can combine
			if (p & Node.DOCUMENT_POSITION_CONTAINED_BY)
				return Math.sign(this.#side - Flags.POSITION_INSIDE);
			if (p & Node.DOCUMENT_POSITION_CONTAINS)
				return Math.sign(Flags.POSITION_INSIDE - other.#side);
			if (p & Node.DOCUMENT_POSITION_PRECEDING)
				return 1;
			if (p & Node.DOCUMENT_POSITION_FOLLOWING)
				return -1;
		}
		// null boundary, disconnected, or implementation specific
		return null;
	}
	/** See where the boundary sits relative to a Node. This just tells if the boundary is inside,
	 * 	before, or after the node. For more detailed comparisons, create a Boundary for `node` to
	 * 	compare with instead (see `compare()`).
	 * @param {Node} node node to compare with
	 * @returns one of the following:
	 * 	- `null` if the boundary is null, in a different DOM tree than node, or the relative postiion can't be determined
	 *  - `POSITION_BEFORE` if the boundary comes before `node` in DOM order
	 *  - `POSITION_INSIDE` if the boundary is inside `node`
	 *  - `POSITION_AFTER` if the boundary comes after `node` in DOM order
	 */	
	compareNode(node){
		if (node === this.#node){
			if (this.#side & Flags.FILTER_INSIDE)
				return Flags.POSITION_INSIDE;
			return this.#side > Flags.POSITION_INSIDE ? Flags.POSITION_AFTER : Flags.POSITION_BEFORE;
		}
		if (!this.#node){
			const p = this.#node.compareDocumentPosition(node);
			// handle contained/contains before preceding/following, since they can combine
			if (p & Node.DOCUMENT_POSITION_CONTAINED_BY)
				return this.#side & Flags.FILTER_CLOSE ? Flags.POSITION_AFTER : Flags.POSITION_BEFORE;
			if (p & Node.DOCUMENT_POSITION_CONTAINS)
				return Flags.POSITION_INSIDE;
			if (p & Node.DOCUMENT_POSITION_PRECEDING)
				return Flags.POSITIN_AFTER;
			if (p & Node.DOCUMENT_POSITION_FOLLOWING)
				return Flags.POSITION_BEFORE;
		}
		// null boundary, disconnected, or implementation specific
		return null;
	}
	/** Check if boundary equals another
	 * @param {Boundary} other boundary to compare with
	 * @returns {Boolean} true if the boundaries are identical
	 */
	isEqual(other){
		return this.#node === other.#node && this.#side === other.#side;
	}
	/** Check if this boundary directly precedes another, in other words, the two Boundary's
	 * 	represent the same DOM insertion point
	 * @param {Boundary} other boundary to compare with
	 * @returns {Boolean} true if `other` is adjacent *following* `this`
	 */
	isAdjacent(other){
		// before_open <-> after_open are not adjacent since one is outside the node and the other inside
		if (!this.#node || !other.#node || this.#side & Flags.FILTER_BEFORE || other.#side & Flags.FILTER_AFTER)
			return false;
		return this.clone().next().isEqual(other);
	}
	/** Check if the boundary node is set (e.g. not null or undefined)
	 * @returns {Boolean} true if boundary is not set
	 */
	isNull(){ return !this.#node; }
	/** Traverses to the nearest boundary point inside the node
	 * @returns {Boundary} modified `this`
	 */
	inside(){
		switch (this.side){
			case Flags.AFTER_CLOSE:
				this.side = Flags.BEFORE_CLOSE;
				break;
			case Flags.BEFORE_OPEN:
				this.side = Flags.AFTER_OPEN;
				break;
		}
		return this;
	}
	/** Traverses to the nearest boundary point outside the node
	 * @returns {Boundary} modified `this`
	 */
	outside(){
		switch (this.side){
			case Flags.BEFORE_CLOSE:
				this.side = Flags.AFTER_CLOSE;
				break;
			case Flags.AFTER_OPEN:
				this.side = Flags.BEFORE_OPEN;
				break;
		}
		return this;
	}	
	/** Traverses to the next boundary point
	 * @returns {Boundary} modified `this`
	 */
	next(){
		if (!this.#node) return;
		switch (this.#side){
			case Flags.AFTER_OPEN:
				const c = this.#node.firstChild;
				if (c)
					this.#set(c, Flags.BEFORE_OPEN);
				else this.#side = Flags.BEFORE_CLOSE;
				break;
			case Flags.AFTER_CLOSE:
				const s = this.#node.nextSibling;
				if (s)
					this.#set(s, Flags.BEFORE_OPEN);
				else this.#set(this.#node.parentNode, Flags.BEFORE_CLOSE);
				break;
			// before -> after
			default:
				this.#side >>= 1;
				break;
		}
		return this;
	}
	/** Traverses to the previous boundary point
	 * @returns {Boundary} modified `this`
	 */
	previous(){
		if (!this.#node) return;
		switch (this.#side){
			case Flags.BEFORE_CLOSE:
				const c = this.#node.lastChild;
				if (c)
					this.#set(c, Flags.AFTER_CLOSE);
				else this.#side = Flags.AFTER_OPEN;
				break;
			case Flags.BEFORE_OPEN:
				const s = this.#node.previousSibling;
				if (s)
					this.#set(s, Flags.AFTER_CLOSE);
				else this.#set(this.#node.parentNode, Flags.AFTER_OPEN);
				break;
			// after -> before
			default:
				this.#side <<= 1;
				break;
		}
		return this;
	}
	/** Generator that yields a Boundary for each unique node. Unlike `next()` this method
	 * 	tracks which nodes have been visited, and only emits their first boundary encountered.
	 * 	This method is meant to mimic `TreeWalker`, but instead always doing a preorder traversal
	 * 	(except when traversing to an unseen parentNode, which will technically be postorder).
	 * 
	 *	For efficiency, `this` is modified just as with `next()`; clone the emitted Boundary if you
	 * 	need a copy.
	 * @yields {Boundary} modified `this`
	 */
	*nextNodes(){
		if (!this.#node) return;
		// always BEFORE_OPEN or BEFORE_CLOSE; need to convert start bounds to this
		if (this.#side & Flags.FILTER_AFTER)
			this.next();
		if (!this.#node) return;
		yield this;
		let depth = 0, n;
		while (true){
			// if BEFORE_CLOSE, we've already passed all the children
			if (this.#side == Flags.BEFORE_OPEN && (n = this.#node.firstChild)){
				this.#node = n;
				depth++;
				yield this;
			}
			else if (n = this.#node.nextSibling){
				this.#set(n, Flags.BEFORE_OPEN);
				yield this;
			}
			else if (n = this.#node.parentNode){
				this.#set(n, Flags.BEFORE_CLOSE);
				// while depth non-zero, we've seen this node already
				if (!depth)
					yield this;
				else --depth;
			}
			else return;
		}
	}
	/** Same as `nextNodes()`, but traversing in the previous direction. See docs for `nextNodes()`
	 * @yields {Boundary} modified `this`
	 */
	*previousNodes(){
		if (!this.#node) return;
		// always AFTER_OPEN or AFTER_CLOSE; need to convert start bounds to this
		if (this.#side & Flags.FILTER_BEFORE)
			this.previous();
		if (!this.#node) return;
		yield this;
		let depth = 0, n;
		while (true){
			// if AFTER_OPEN, we've already passed all the children
			if (this.#side == Flags.AFTER_CLOSE && (n = this.#node.lastChild)){
				this.#node = n;
				depth++;
				yield this;
			}
			else if (n = this.#node.previousSibling){
				this.#set(n, Flags.AFTER_CLOSE);
				yield this;
			}
			else if (n = this.#node.parentNode){
				this.#set(n, Flags.AFTER_OPEN);
				// while depth non-zero, we've seen this node already
				if (!depth)
					yield this;
				else --depth;
			}
			else return;
		}
	}
	/** Insert nodes into the DOM at this boundary position */
	insert(...nodes){
		if (!this.#node)
			throw Error("inserting at null Boundary");
		switch (this.#side){
			case Flags.BEFORE_OPEN:
				this.#node.before(...nodes);
				break;
			case Flags.AFTER_OPEN:
				this.#node.prepend(...nodes);
				break;
			case Flags.BEFORE_CLOSE:
				this.#node.append(...nodes);
				break;
			case Flags.AFTER_CLOSE:
				this.#node.after(...nodes);
				break;
		}
	}
}

/** Similar to builtin Range or StaticRange interfaces, but encodes the start/end of the range using
 * 	`Boundary`. The anchors are not specified as an offset into a parent's children, so the range
 * 	is robust to modifications of the DOM. In particular, you can use this to encode bounds for
 * 	mutations, as DOM changes within the range will not corrupt the range.
 */
class BoundaryRange{
	#start;
	#end;
	/** Create a new range
	 * @param {Range | StaticRange | BoundaryRange | [Boundary, Boundary]} args one of these formats:
	 * 	- *empty*: uninitialized range; set start/end manually before using the range
	 * 	- `Range` or `StaticRange`: converts from a Range, defaulting to an "exclusive" range,
	 * 		see `normalize()`
	 * 	- `BoundaryRange`: equivalent to `cloneRange()`
	 * 	- `[Boundary, Boundary`]: set the start/end anchors to be a copy of these boundaries
	 * 
	 *  For more control over itialization, leave args empty and use `setStart()` and `setEnd()` instead.
	 * 	You may also set `start`/`end` to a Boundary directly if desired.
	 */
	constructor(...args){		
		this.#start = new Boundary();
		this.#end = new Boundary();
		// optional init
		switch (args.length){
			case 1:
				const o = args[0];
				if (o instanceof BoundaryRange){
					this.#start.set(o.start);
					this.#end.set(o.end);
				}
				// Range/StaticRange
				else{
					this.#start.set(o.startContainer, o.startOffset, Flags.POSITION_BEFORE);
					this.#end.set(o.endContainer, o.endOffset, Flags.POSITION_AFTER);
				}
				break;
			case 2:
				const [s, e] = args;
				this.#start.set(s);
				this.#end.set(e);
				break;
		}
	}
	/** @returns {Boundary} start of the range */
	get start(){ return this.#start; }
	set start(b){
		if (!(b instanceof Boundary))
			throw Error("expected Boundary for start");
	}
	/** Update start anchor; equivalent to `this.start.set()` */
	setStart(...args){ this.#start.set(...args); }
	/** @returns {Boundary} end of the range */
	get end(){ return this.#end; }
	set end(b){
		if (!(b instanceof Boundary))
			throw Error("expected Boundary for end");
	}
	/** Update end anchor; equivalent to `this.end.set()` */
	setEnd(...args){ this.#end.set(...args); }

	/** Make a copy of this range object */
	cloneRange(){
		return new BoundaryRange(this);
	}
	/** Convert to Range interface. Range's end is set last, so if the resulting range's
	 * 	anchors would be out of order, it would get collapsed to the end anchor. Boundaries inside
	 *	a CharacterData node are treated as outside for conversion purposes.
	 * @returns {Range}
	 */
	toRange(){
		const r = new Range();
		if (this.isNull())
			throw Error("cannot create Range from null BoundaryRange")
		// start anchor
		const sn = this.#start.node;
		let sb = this.#start.side;
		if (sn instanceof CharacterData)
			sb = sb == Flags.AFTER_OPEN ? Flags.BEFORE_OPEN : Flags.AFTER_CLOSE;
		switch (sb){
			case Flags.BEFORE_OPEN:
				r.setStartBefore(sn);
				break;
			case Flags.AFTER_OPEN:
				r.setStart(sn, 0);
				break;
			case Flags.BEFORE_CLOSE:
				r.setStart(sn, sn.childNodes.length);
				break;
			case Flags.AFTER_CLOSE:
				r.setStartAfter(sn);
				break;
		}
		// end anchor
		const en = this.#end.node;
		let eb = this.#start.side;
		if (en instanceof CharacterData)
			eb = eb == Flags.AFTER_OPEN ? Flags.BEFORE_OPEN : Flags.AFTER_CLOSE;
		switch (eb){
			case Flags.BEFORE_OPEN:
				r.setEndBefore(en);
				break;
			case Flags.AFTER_OPEN:
				r.setEnd(en, 0);
				break;
			case Flags.BEFORE_CLOSE:
				r.setEnd(en, en.childNodes.length);
				break;
			case Flags.AFTER_CLOSE:
				r.setEndAfter(en);
				break;
		}
		return r;
	}
	/** Convert to StaticRange interface. Boundaries inside a CharacterData node are treated as
	 * 	outside for conversion purposes.
	 * @returns {StaticRange}
	 */
	toStaticRange(){
		if (this.isNull())
			throw Error("cannot create StaticRange from null BoundaryRange")
		// Range may have side effects from being unordered, so can't reuse toRange for this
		const sa = this.#start.toAnchor();
		const ea = this.#end.toAnchor();
		return new StaticRange({
			startContainer: sa.node,
			startOffset: sa.offset,
			endContainer: ea.node,
			endOffset: ea.offset
		});
	}

	/** Check if the range has been fully set (e.g. neither boundary is null)
	 * @returns {Boolean} true if range is not set, or is only partially set
	 */
	isNull(){
		return this.#start.isNull() || this.#end.isNull();
	}
	/** Check if range exactly matches another
	 * @param {BoundaryRange} other range to compare with
	 */
	isEqual(other){
		return this.#start.isEqual(other.start) && this.#end.isEqual(other.end);
	}
	/** Check if the range is collapsed in the current DOM. The start/end boundaries must be equal,
	 * 	or start/end must be adjacent to eachother (see `Boundary.isAdjacent()`)
	 * @returns {Boolean} true if collapsed, otherwise false; if the start/end anchors
	 * 	are disconnected or out-of-order, it returns false
	 */
	get collapsed(){
		return this.#start.isEqual(this.#end) || this.#start.isAdjacent(this.#end);
	}
	/** Collapse the range to one of the boundary points
	 * @param {Boolean} toStart if true collapses to the start anchor (after/after_close);
	 * 	if false (the default), collapses to the end anchor (before/before_open)
	 */
	collapse(toStart=false){
		if (toStart)
			this.#end = this.#start.clone();
		else this.#start = this.#end.clone();
	}
	/** Extend this range to include the bounds of another BoundaryRange. If the start/end has
	 * 	not been set yet, it will simply copy from `other`
	 * @param {BoundaryRange} other extend bounds to enclose this range
	 */
	extend(other){
		if (this.#start.isNull())
			this.#start = other.start.clone();
		else if (this.#start.compare(other.start) == 1)
			this.#start.set(other.start);
		if (this.#end.isNull())
			this.#end = other.end.clone();
		else if (this.#end.compare(other.end) == -1)
			this.#end.set(other.end);
	}
	/** Set range to surround a single node
	 * @param {Node} node the node to surround
	 * @param {Boolean} exclusive see `normalize()`
	 */
	selectNode(node, exclusive=false){
		this.#start.set(node, Flags.BEFORE_OPEN);
		this.#end.set(node, Flags.AFTER_CLOSE);
		if (exclusive){
			this.#start.previous();
			this.#end.next();
		}
	}
	/** Set range to surround the contents of a node;
	 * 	Warning, for CharacterData nodes, you probably want to use selectNode instead,
	 * 	since these nodes cannot have children
	 * @param {Node} node node whose contents to enclose
	 * @param {Boolean} exclusive see `normalize()`
	 */
	selectNodeContents(node, exclusive=true){
		this.#start.set(node, Flags.AFTER_OPEN);
		this.#end.set(node, Flags.BEFORE_CLOSE);
		if (!exclusive){
			this.#start.next();
			this.#end.previous();
		}
	}
	/** Every boundary has one adjacent boundary at the same position. On one side you have the
	 *  AFTER_OPEN/AFTER_CLOSE bounds, and following it will be a BEFORE_OPEN/BEFORE_CLOSE bounds.
	 *  See `Boundary.isAdjacent()`. The start/end anchors can use either boundary and the range is
	 *  equivalent. There are two normalization modes:
	 * 
	 * 	- **exclusive**: start/end anchor boundaries are outside the range; e.g. start boundary is
	 * 		AFTER and end boundary is BEFORE type
	 * 	- **inclusive**: start/end anchor boundaries are inside the range; e.g. start boundary is
	 * 		BEFORE and end boundary is AFTER type
	 * 
	 * 	For example, if you are encoding a range of mutations, you want to normalize the range to
	 * 	be exclusive; that way, the mutated nodes inside the range will not affect the boundaries.
	 * @param {Boolean} exclusive true for exclusive bounds, or false for inclusive
	 */
	normalize(exclusive=true){
		if (exclusive){
			if (this.#start.side & Flags.FILTER_BEFORE)
				this.#start.previous();
			if (this.#end.side & Flags.FILTER_AFTER)
				this.#end.next();
		}
		else{
			if (this.#start.side & Flags.FILTER_AFTER)
				this.#start.next();
			if (this.#end.side & Flags.FILTER_BEFORE)
				this.#end.previous();
		}
	}	
}

// could maybe rename it to NodeBoundaryXXX
export { Flags as BoundaryFlags, Boundary, BoundaryRange };
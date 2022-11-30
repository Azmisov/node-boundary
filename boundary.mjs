// Better to have these as constants for minification
const BEFORE_OPEN = 0b1,
	AFTER_OPEN = 0b10,
	BEFORE_CLOSE = 0b1000,
	AFTER_CLOSE = 0b10000,
	FILTER_ALL = 0b11011,
	FILTER_OPEN = 0b11,
	FILTER_CLOSE = 0b11000,
	FILTER_BEFORE = 0b1001,
	FILTER_AFTER = 0b10010,
	FILTER_INSIDE = 0b1010,
	FILTER_OUTSIDE = 0b10001,
	POSITION_BEFORE = 0b0,
	POSITION_INSIDE = 0b100,
	POSITION_AFTER = 0b100000;

/** Boundary bit flags. Use these to define and work with a boundary's side. The primary bit flags
 * are ordered by their DOM position, so can be used for comparisions. E.g. `BEFORE_OPEN < AFTER_OPEN`.
 * To use the filter bitmasks, you need to use bitwise operations, for example:
 * 
 * ```js
 * BEFORE_OPEN & FILTER_OPEN // true
 * (AFTER_OPEN | BEFORE_CLOSE) & FILTER_OPEN // true
 * ```
 * 
 * @see {@link Boundary#side}
 * @readonly
 * @enum
 * @alias BoundaryFlags
 */
const Flags = {
	// for Boundary.side; magnitude matches DOM order
	/** Denotes a position before the opening boundary of a node (outside the node) */
	BEFORE_OPEN,
	/** Denotes a position after the opening boundary of a node (inside the node) */
	AFTER_OPEN,
	/** Denotes a position before the closing boundary of a node (inside the node) */
	BEFORE_CLOSE,
	/** Denotes a position after the closing boundary of a node (outside the node) */
	AFTER_CLOSE,

	// for filtering by Boundary.side
	/** Bitmask to filter any position */
	FILTER_ALL,
	/** Bitmask to filter positions relative to a node's opening boundary */
	FILTER_OPEN,
	/** Bitmask to filter positions relative to a node's closing boundary */
	FILTER_CLOSE,
	/** Bitmask to filter positions before the opening or closing node boundary */
	FILTER_BEFORE,
	/** Bitmask to filter positions after the opening or closing node boundary */
	FILTER_AFTER,
	/** Bitmask to filter positions inside the reference node */
	FILTER_INSIDE,
	/** Bitmask to filter positions outside the reference node */
	FILTER_OUTSIDE,

	// for comparing positions relative to a boundary
	/** Used to indicate a Boundary that is before a node; `BEFORE_OPEN > POSITION_BEFORE` */
	POSITION_BEFORE,
	/** Used to indicate a Boundary that is inside a node; `AFTER_OPEN > POSITION_INSIDE > BEFORE_CLOSE` */
	POSITION_INSIDE,
	/** Used to indicate a Boundary that is after a node; `POSITION_AFTER > AFTER_CLOSE` */
	POSITION_AFTER
};

/**
 * Encodes a node boundary. Every node has an opening and closing boundary; for HTML, this
 * corresponds to the opening/closing tag. There is also an inner and outer half to each boundary,
 * denoting the bounds for a node's children and siblings respectively. For example:
 * 	
 * ```html
 * A<span>B C</span>D
 * ```
 * 
 * Each of the letters illustrates a different boundary in reference to the `<span>` node. When defining a
 * Boundary, you specify a reference node, and one of four sides:
 * - A: {@link BoundaryFlags.BEFORE_OPEN|BEFORE_OPEN}
 * - B: {@link BoundaryFlags.AFTER_OPEN|AFTER_OPEN}
 * - C: {@link BoundaryFlags.BEFORE_CLOSE|BEFORE_CLOSE}
 * - D: {@link BoundaryFlags.AFTER_CLOSE|AFTER_CLOSE}
 * 
 * These are bit flags, so can use bitmasks for filtering. The flags are ordered numerically by
 * their DOM position, so you can do comparisons, e.g. `BEFORE_OPEN < AFTER_OPEN`.
 */
class Boundary{
	#node;
	#side;
	/** validate side flag
	 * @private
	 */
	static #valid_side(b){
		return b == BEFORE_OPEN || b == AFTER_OPEN ||
			b == BEFORE_CLOSE || b == AFTER_CLOSE;
	}
	/** set node and side together
	 * @private
	 */
	#set(node, side){
		this.#node = node;
		this.#side = side;
	}

	/** Create a new boundary; takes up to three arguments:
	 * @param args - One of three formats:
	 * 1. Pass a `Boundary` to copy
	 * 2. Pass a `Node` and one of {@link BoundaryFlags.BEFORE_OPEN|BEFORE_OPEN}, {@link BoundaryFlags.AFTER_OPEN|AFTER_OPEN},
	 *    {@link BoundaryFlags.BEFORE_CLOSE|BEFORE_CLOSE}, or {@link BoundaryFlags.AFTER_CLOSE|AFTER_CLOSE} flag
	 * 3. In the manner of the builtin Range interface, pass an anchor `Node`, an offset into that
	 *    anchor, and one of {@link BoundaryFlags.POSITION_BEFORE|POSITION_BEFORE} or {@link BoundaryFlags.POSITION_AFTER|POSITION_AFTER} flag, indicating which side of
	 *    the anchor you wish to get the boundary for. Since the Range interface uses text offsets
	 * 	  for CharacterData nodes, if the first arg is CharacterData the offset will be ignored,
	 * 	  instead setting the boundary to be outside. If you want to place the boundary inside a
	 *    CharacterData node, set so directly using syntax #2.
	 */
	constructor(...args){
		this.set(...args);
	}
	/** Update boundary values. Same arguments as the [constructor]{@link Boundary#Boundary} */
	set(...args){
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
				if (position != POSITION_BEFORE && position != POSITION_AFTER)
					throw TypeError("expected a position bit flag for third arg")
				const istxt = node instanceof CharacterData;
				if (istxt)
					this.#side = position ? AFTER_CLOSE : BEFORE_OPEN;
				else{
					// left/right side; edges switch to AFTER_OPEN/BEFORE_CLOSE
					if (position)
						this.#side = offset >= node.childNodes.length ? BEFORE_CLOSE : BEFORE_OPEN;
					else this.#side = offset <= 0 ? AFTER_OPEN : AFTER_CLOSE;
					// if we are referencing a child node
					if (this.#side & FILTER_OUTSIDE)
						node = node.childNodes[offset - !position];
				}
				this.#node = node;
				// For text, we first clamp outside, then we clamp again to match the desird `position`;
				// no way currently to do an "inclusive" boundary of a CharacterNode using this input syntax
				if (istxt)
					position ? this.next() : this.previous();
			} break;
			default:
				this.#set(null, BEFORE_OPEN);
				break;
		}
	}
	// Property access
	/** node whose boundary we reference
	 * @type {Node}
	 */
	get node(){ return this.#node; }
	set node(node){
		if (!(node instanceof Node || node === null))
			throw TypeError("node must be a Node or null");
		this.#node = node;
	}
	/** bit flag giving which side of the node our boundary is for; this is one of
	 * {@link BoundaryFlags}
	 * @type {Number}
	 */
	get side(){ return this.#side; }
	set side(side){
		if (!Boundary.#valid_side(side))
			throw TypeError("invalid side bit flag");
		this.#side = side;
	}
	/** Copy this Boundary object
	 * @returns {Boundary} cloned boundary
	 */
	clone(){
		return new Boundary(this);
	}
	/** Convert to an anchor, in the manner of the builtin Range/StaticRange interface.
	 * 
	 * ```js
	 * const {node, offset} = boundary.toAnchor();
	 * const range = new Range();
	 * range.setStart(node, offset);
	 * ```
	 * 
	 * @param {boolean} [text=true] The Range interface switches to encoding text offsets for
	 *  CharacterData nodes, instead of encoding a child offset like other node types. We allow a
	 *  boundary inside a CharacterData node though, so these boundaries can't be represented with
	 *  Range.
	 * 
	 *  Set this parameter to `true` to use nearest outside boundary for CharacterData nodes, which
	 *  is what makes more sense for use with Range. Set this to `false` to do no conversion, which
	 *  can be useful if you are not using the anchor with Range.
	 * @returns {Object} An object with the following members:
	 * - `node` (`Node`): a reference parent node
	 * - `offset` (`number`): offset inside the node's childNodes list
	 */
	toAnchor(text=true){
		if (!this.#node)
			throw Error("cannot convert null Boundary to anchor");
		let node = this.#node, offset = 0;
		// calculate offset by finding node's index in parent's child nodes
		if (this.#side & FILTER_OUTSIDE || (text && node instanceof CharacterData)){
			let child = node;
			node = node.parentNode;
			// Range offset indexes the previous side (so open boundaries are exclusive)
			if (this.#side & FILTER_OPEN)
				child = child.previousSibling;
			while (child !== null){
				child = child.previousSibling
				offset++;
			}
		}
		else if (this.#side == BEFORE_CLOSE)
			offset = node.childNodes.length;
		return {node, offset};
	}
	/** Compare relative position of two boundaries
	 * @param {Boundary} other boundary to compare with
	 * @returns {?number} One of the following:
	 * - `null` if the boundaries are from different DOM trees or the relative position can't be determined
	 * - `0` if they are equal (see also [isEqual]{@link Boundary#isEqual} for a faster equality check)
	 * - `1` if this boundary is after `other`
	 * - `-1` if this boundary is before `other`
	 * 
	 * Note, two boundaries that are adjacent, but have differing nodes/boundaries are not
	 * considered "equal". They have an implicit side to them. Use
	 * [isAdjacent]{@link Boundary#isAdjacent} to check for this case instead.
	 */
	compare(other){
		if (this.#node === other.#node)
			return Math.sign(this.#side - other.#side);
		if (this.#node && other.#node){
			const p = this.#node.compareDocumentPosition(other.#node);
			// handle contained/contains before preceding/following, since they can combine
			if (p & Node.DOCUMENT_POSITION_CONTAINED_BY)
				return Math.sign(this.#side - POSITION_INSIDE);
			if (p & Node.DOCUMENT_POSITION_CONTAINS)
				return Math.sign(POSITION_INSIDE - other.#side);
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
	 * 	compare with instead (see [compare]{@link Boundary#compare}).
	 * @param {Node} node node to compare with
	 * @returns {?number} One of the following:
	 * - `null` if the boundary is null, in a different DOM tree than node, or the relative postiion can't be determined
	 * - {@link BoundaryFlags.POSITION_BEFORE|POSITION_BEFORE} if the boundary comes before `node` in DOM order
	 * - {@link BoundaryFlags.POSITION_INSIDE|POSITION_INSIDE} if the boundary is inside `node`
	 * - {@link BoundaryFlags.POSITION_AFTER|POSITION_AFTER} if the boundary comes after `node` in DOM order
	 */	
	compareNode(node){
		if (node === this.#node){
			if (this.#side & FILTER_INSIDE)
				return POSITION_INSIDE;
			return this.#side > POSITION_INSIDE ? POSITION_AFTER : POSITION_BEFORE;
		}
		if (!this.#node){
			const p = this.#node.compareDocumentPosition(node);
			// handle contained/contains before preceding/following, since they can combine
			if (p & Node.DOCUMENT_POSITION_CONTAINED_BY)
				return this.#side & FILTER_CLOSE ? POSITION_AFTER : POSITION_BEFORE;
			if (p & Node.DOCUMENT_POSITION_CONTAINS)
				return POSITION_INSIDE;
			if (p & Node.DOCUMENT_POSITION_PRECEDING)
				return POSITION_AFTER;
			if (p & Node.DOCUMENT_POSITION_FOLLOWING)
				return POSITION_BEFORE;
		}
		// null boundary, disconnected, or implementation specific
		return null;
	}
	/** Check if boundary equals another
	 * @param {Boundary} other boundary to compare with
	 * @returns {boolean} true if the boundaries are identical
	 */
	isEqual(other){
		return this.#node === other.#node && this.#side === other.#side;
	}
	/** Check if this boundary directly precedes another, and is the same DOM insertion point. For
	 * example, given the following DOM with letters representing boundaries:
	 * 
	 * ```html
	 * <main>A B<article>C D<span>E F</span>G H</article>I J</main>
	 * ```
	 * 
	 * The pairs (A,B), (C,D), (E,F), (G,H), and (I,J) are considered "adjacent". While they
	 * represent the same DOM position, they differ in whether they are in reference to the
	 * preceding or following node. The preceding boundary will always have an "AFTER" side, with
	 * the adjacent following boundary having a "BEFORE" side (see {@link BoundaryFlags}).
	 * @param {Boundary} other boundary to compare with
	 * @returns {boolean} true if `other` is adjacent *and* following `this`
	 */
	isAdjacent(other){
		// before_open <-> after_open are not adjacent since one is outside the node and the other inside
		if (!this.#node || !other.#node || this.#side & FILTER_BEFORE || other.#side & FILTER_AFTER)
			return false;
		return this.clone().next().isEqual(other);
	}
	/** Check if the boundary node is not set (e.g. null). A null reference node is allowed, and can
	 * be used to signal the end of DOM traversal or an unset Boundary.
	 * @returns {boolean} true if boundary is not set
	 */
	isNull(){ return !this.#node; }
	/** Traverses to the nearest boundary point inside the node. For example:
	 * 
	 * ```html
	 * A<span>B C</span>D
	 * ```
	 * 
	 * A would become B and D would become C.
	 * @returns {Boundary} modified `this`
	 */
	inside(){
		switch (this.side){
			case AFTER_CLOSE:
				this.side = BEFORE_CLOSE;
				break;
			case BEFORE_OPEN:
				this.side = AFTER_OPEN;
				break;
		}
		return this;
	}
	/** Traverses to the nearest boundary point outside the node.
	 * Performs the inverse of {@link Boundary#inside|inside}
	 * @see {@link Boundary#inside|inside} for additional details
	 * @returns {Boundary} modified `this`
	 */
	outside(){
		switch (this.side){
			case BEFORE_CLOSE:
				this.side = AFTER_CLOSE;
				break;
			case AFTER_OPEN:
				this.side = BEFORE_OPEN;
				break;
		}
		return this;
	}	
	/** Traverses to the next boundary point in the DOM tree. For example:
	 * 
	 * ```html
	 * A<span>B C</span>D
	 * ```
	 * 
	 * Given a boundary starting at A, traversal would proceed to B, C, D, and finally null
	 * to signal an end to traversal.
	 * @returns {Boundary} modified `this`
	 */
	next(){
		if (!this.#node) return;
		switch (this.#side){
			case AFTER_OPEN:
				const c = this.#node.firstChild;
				if (c)
					this.#set(c, BEFORE_OPEN);
				else this.#side = BEFORE_CLOSE;
				break;
			case AFTER_CLOSE:
				const s = this.#node.nextSibling;
				if (s)
					this.#set(s, BEFORE_OPEN);
				else this.#set(this.#node.parentNode, BEFORE_CLOSE);
				break;
			// before -> after
			default:
				this.#side >>= 1;
				break;
		}
		return this;
	}
	/** Traverses to the previous boundary point.
	 * Performs the inverse of {@link Boundary#next|next}
	 * @see {@link Boundary#next|next} for additional details
	 * @returns {Boundary} modified `this`
	 */
	previous(){
		if (!this.#node) return;
		switch (this.#side){
			case BEFORE_CLOSE:
				const c = this.#node.lastChild;
				if (c)
					this.#set(c, AFTER_CLOSE);
				else this.#side = AFTER_OPEN;
				break;
			case BEFORE_OPEN:
				const s = this.#node.previousSibling;
				if (s)
					this.#set(s, AFTER_CLOSE);
				else this.#set(this.#node.parentNode, AFTER_OPEN);
				break;
			// after -> before
			default:
				this.#side <<= 1;
				break;
		}
		return this;
	}
	/** Generator that yields a Boundary for each unique node when traversing in the "next"
	 * direction. Unlike {@link Boundary#next|next} this method tracks which nodes have been
	 * visited, and only emits their first boundary encountered. This method is meant to mimic the
	 * single node traversal of `TreeWalker`, but it yields a node when any of its boundaries is
	 * crossed. *(Essentially doing a preorder traversal regardless of direction, except when
	 * traversing an unseen parentNode, which will be postorder).* For example:
	 * 
	 * ```html
	 * A <main>B C<article>D E</article>F G</main>H
	 * ```
	 * 
	 * Given a boundary starting with...
	 * - C: yield C, G, null
	 * - D: yield E, G, null
	 * 
	 * Note that the yielded {@link Boundary#side|side} will always be {@link BoundaryFlags.BEFORE_OPEN|BEFORE_OPEN}
	 * or {@link BoundaryFlags.BEFORE_OPEN|BEFORE_CLOSE}. If the current Boundary is one of these types,
	 * it will be yielded first by default.
	 * 
	 * @param {boolean} [include_start=true] whether to yield the starting Boundary if it is of type "BEFORE"
	 * @yields {Boundary} Modified `this`; traversal continues until there is neither sibling or
	 * parent node. If you need a copy for each iteration, [clone]{@link Boundary#clone} the emitted
	 * Boundary.
	 */
	*nextNodes(include_start=true){
		// always BEFORE_OPEN or BEFORE_CLOSE; need to convert start bounds to this
		const after = this.#side & FILTER_AFTER;
		if (after || !include_start){
			this.next();
			if (!after)
				this.next();
		}
		if (!this.#node) return;
		yield this;
		let depth = 0, n;
		while (true){
			// if BEFORE_CLOSE, we've already passed all the children
			if (this.#side == BEFORE_OPEN && (n = this.#node.firstChild)){
				this.#node = n;
				depth++;
				yield this;
			}
			else if (n = this.#node.nextSibling){
				this.#set(n, BEFORE_OPEN);
				yield this;
			}
			else if (n = this.#node.parentNode){
				this.#set(n, BEFORE_CLOSE);
				// while depth non-zero, we've seen this node already
				if (!depth)
					yield this;
				else --depth;
			}
			else return;
		}
	}
	/** Performs the inverse of {@link Boundary#nextNodes|nextNodes}. Note that when traversing in
	 * the previous direction, the side will always be one of
	 * {@link BoundaryFlags.AFTER_OPEN|AFTER_OPEN} or {@link BoundaryFlags.AFTER_CLOSE|AFTER_CLOSE}
	 * @param {boolean} [include_start=true] whether to yield the starting Boundary if it is of type "AFTER"
	 * @see {@link Boundary#nextNodes|nextNodes} for additional details
	 * @yield {Boundary} modified `this`
	 */
	*previousNodes(include_start=true){
		// always AFTER_OPEN or AFTER_CLOSE; need to convert start bounds to this
		const before = this.#side & FILTER_BEFORE;
		if (before || !include_start){
			this.previous();
			if (!before)
				this.previous();
		}
		if (!this.#node) return;
		yield this;
		let depth = 0, n;
		while (true){
			// if AFTER_OPEN, we've already passed all the children
			if (this.#side == AFTER_CLOSE && (n = this.#node.lastChild)){
				this.#node = n;
				depth++;
				yield this;
			}
			else if (n = this.#node.previousSibling){
				this.#set(n, AFTER_CLOSE);
				yield this;
			}
			else if (n = this.#node.parentNode){
				this.#set(n, AFTER_OPEN);
				// while depth non-zero, we've seen this node already
				if (!depth)
					yield this;
				else --depth;
			}
			else return;
		}
	}
	/** Insert nodes into the DOM at this boundary position
	 * @param {Node} nodes the nodes to insert
	 */
	insert(...nodes){
		if (!this.#node)
			throw Error("inserting at null Boundary");
		switch (this.#side){
			case BEFORE_OPEN:
				this.#node.before(...nodes);
				break;
			case AFTER_OPEN:
				this.#node.prepend(...nodes);
				break;
			case BEFORE_CLOSE:
				this.#node.append(...nodes);
				break;
			case AFTER_CLOSE:
				this.#node.after(...nodes);
				break;
		}
	}
}

/** Similar to builtin Range or StaticRange interfaces, but encodes the start/end of the range using
 * {@link Boundary}. The anchors are not specified as an offset into a parent's children, so the
 * range is robust to modifications of the DOM. In particular, you can use this to encode bounds for
 * mutations, as DOM changes within the range will not corrupt the range. Conveniently, many
 * comparisons and range operations can be performed on the individual start/end anchors via the
 * {@link Boundary} class.
 */
class BoundaryRange{
	#start;
	#end;
	/** Create a new range; takes up to two arguments:
	 * @param {Range|StaticRange|BoundaryRange|Boundary[]} args One of these formats:
	 * - *empty*: uninitialized range; you should set start/end manually before using the range
	 * - `Range` or `StaticRange`: converts from a Range, defaulting to an "exclusive" range,
	 *	  see {@link BoundaryRange#normalize|normalize}
	 * - `BoundaryRange`: equivalent to {@link BoundaryRange#cloneRange|cloneRange}
	 * - `[Boundary, Boundary]`: set the start/end anchors to be a copy of these boundaries
	 * 
	 * For more control over initialization, leave args empty and use
	 * {@link BoundaryRange#setStart|setStart} and {@link BoundaryRange#setEnd|setEnd} instead. You
	 * may also directly manipulate or assign {@link BoundaryRange#start|start} or {@link BoundaryRange#start|end}
	 * if desired.
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
					this.#start.set(o.startContainer, o.startOffset, POSITION_BEFORE);
					this.#end.set(o.endContainer, o.endOffset, POSITION_AFTER);
				}
				break;
			case 2:
				const [s, e] = args;
				this.#start.set(s);
				this.#end.set(e);
				break;
		}
	}
	/** Starting anchor of the range. You can access or assign this directly as needed
	 * @type {Boundary}
	 */
	get start(){ return this.#start; }
	set start(b){
		if (!(b instanceof Boundary))
			throw Error("expected Boundary for start");
	}
	/** Update {@link BoundaryRange#start|start} anchor; equivalent to `this.start.set()`
	 * @param args forwarded to {@link Boundary#set}
	 * @see {@link Boundary#set} for arguments
	 * @returns {BoundaryRange} modified `this`
	 */
	setStart(...args){
		this.#start.set(...args);
		return this;
	}
	/** Ending anchor of the range. You can access or assign this directly as needed
	 * @type {Boundary}
	 */
	get end(){ return this.#end; }
	set end(b){
		if (!(b instanceof Boundary))
			throw Error("expected Boundary for end");
	}
	/** Update {@link BoundaryRange#end|end} anchor; equivalent to `this.end.set()`
	 * @param args forwarded to {@link Boundary#set}
	 * @see {@link Boundary#set} for arguments
	 * @returns {BoundaryRange} modified `this`
	 */
	setEnd(...args){
		this.#end.set(...args);
		return this;
	}

	/** Make a copy of this range object
	 * @returns {BoundaryRange} cloned range
	 */
	cloneRange(){
		return new BoundaryRange(this);
	}
	/** Convert to `Range` interface. Range's end is set last, so if the resulting range's
	 * anchors would be out of order, it would get collapsed to the end anchor. Boundaries inside
	 * a CharacterData node are treated as outside for conversion purposes. If the current BoundaryRange
	 * {@link BoundaryRange#isNull|isNull}, an uninitialized Range will be returned.
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
			sb = sb == AFTER_OPEN ? BEFORE_OPEN : AFTER_CLOSE;
		switch (sb){
			case BEFORE_OPEN:
				r.setStartBefore(sn);
				break;
			case AFTER_OPEN:
				r.setStart(sn, 0);
				break;
			case BEFORE_CLOSE:
				r.setStart(sn, sn.childNodes.length);
				break;
			case AFTER_CLOSE:
				r.setStartAfter(sn);
				break;
		}
		// end anchor
		const en = this.#end.node;
		let eb = this.#end.side;
		if (en instanceof CharacterData)
			eb = eb == AFTER_OPEN ? BEFORE_OPEN : AFTER_CLOSE;
		switch (eb){
			case BEFORE_OPEN:
				r.setEndBefore(en);
				break;
			case AFTER_OPEN:
				r.setEnd(en, 0);
				break;
			case BEFORE_CLOSE:
				r.setEnd(en, en.childNodes.length);
				break;
			case AFTER_CLOSE:
				r.setEndAfter(en);
				break;
		}
		return r;
	}
	/** Convert to `StaticRange` interface. Boundaries inside a CharacterData node are treated as
	 *  outside for conversion purposes. If the current BoundaryRange
	 *  {@link BoundaryRange#isNull|isNull}, an error will be thrown since a `StaticRange` cannot be
	 *  created uninitialized.
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

	/** Check if the range has been fully set, e.g. neither boundary is null
	 * @see {@link Boundary#isNull}
	 * @returns {boolean} true if range is not set, or is only partially set
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
	 * or start/end must be adjacent to eachother (see {@link Boundary#isEqual} and
	 * {@link Boundary#isAdjacent}). If the start/end anchors are disconnected or out-of-order, it
	 * returns false.
	 * @type {boolean}
	 */
	get collapsed(){
		return this.#start.isEqual(this.#end) || this.#start.isAdjacent(this.#end);
	}
	/** Collapse the range to one of the boundary points. After calling this method, the start
	 * anchor will equal the end: `this.start.isEqual(this.end)` (see {@link Boundary#isEqual}). If
	 * you would like to instead collapse with the start/end anchors *adjacent* (see
	 * {@link Boundary#isAdjacent}), then follow with a call to
	 * {@link BoundaryRange#normalize|normalize}.
	 * @param {boolean} [toStart=false] If true, collapses to the {@link BoundaryRange#start|start};
	 * otherwise collapses to {@link BoundaryRange#end|end}
	 * @returns {BoundaryRange} modified `this`
	 */
	collapse(toStart=false){
		if (toStart)
			this.#end = this.#start.clone();
		else this.#start = this.#end.clone();
		return this;
	}
	/** Extend this range to include the bounds of another BoundaryRange. If the start/end has
	 * 	not been set yet, it will simply copy from `other`. Example:
	 * 
	 * ```html
	 * <div id='a'></div> <div id='b'></div>
	 * ```
	 * ```js
	 * const ra = (new BoundaryRange()).selectNode(a);
	 * const rb = (new BoundaryRange()).selectNodeContents(b)
	 * ra.extend(rb);
	 * // ra.start == (a, BEFORE_OPEN)
	 * // ra.end == (b, BEFORE_CLOSE)
	 * ```
	 * 
	 * @param {BoundaryRange} other extend bounds to enclose this range
	 * @returns {BoundaryRange} modified `this`
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
		return this;
	}
	/** Set range to surround a single node
	 * @param {Node} node the node to surround
	 * @param {boolean} [exclusive=true] see {@link BoundaryRange#normalize|normalize}
	 * @returns {BoundaryRange} modified `this`
	 */
	selectNode(node, exclusive=false){
		this.#start.set(node, BEFORE_OPEN);
		this.#end.set(node, AFTER_CLOSE);
		if (exclusive){
			this.#start.previous();
			this.#end.next();
		}
		return this;
	}
	/** Set range to surround the contents of a node. Warning, for CharacterData nodes, you probably
	 * want to use {@link Boundary#selectNode|selectNode} instead, since these nodes cannot have
	 * children
	 * @param {Node} node node whose contents to enclose
	 * @param {boolean} [exclusive=true] see {@link BoundaryRange#normalize|normalize}
	 * @returns {BoundaryRange} modified `this`
	 */
	selectNodeContents(node, exclusive=true){
		this.#start.set(node, AFTER_OPEN);
		this.#end.set(node, BEFORE_CLOSE);
		if (!exclusive){
			this.#start.next();
			this.#end.previous();
		}
		return this;
	}
	/** Every boundary has one adjacent boundary at the same position. On one side you have the
	 * {@link BoundaryFlags.AFTER_OPEN|AFTER_OPEN}/{@link BoundaryFlags.AFTER_CLOSE|AFTER_CLOSE}
	 * bounds, and following it will be a
	 * {@link BoundaryFlags.BEFORE_OPEN|BEFORE_OPEN}/{@link BoundaryFlags.BEFORE_CLOSE|BEFORE_CLOSE}
	 * bounds. See {@link Boundary#isAdjacent}. The start/end anchors can use either boundary and the
	 * range positions will be equivalent; the main difference is the behavior when the DOM is mutated,
	 * as the reference nodes will be different. There are two normalization modes:
	 * 
	 * 1. **exclusive**: start/end anchor boundaries are outside the range; e.g. start boundary is
	 * 	  AFTER and end boundary is BEFORE type
	 * 2. **inclusive**: start/end anchor boundaries are inside the range; e.g. start boundary is
	 * 	  BEFORE and end boundary is AFTER type
	 * 
	 * For example, if you are encoding a range of mutations, you might want to normalize the range
	 * to be exclusive; that way, the mutated nodes inside the range will not affect the boundaries.
	 * @param {boolean} [exclusive=true] true for exclusive bounds, or false for inclusive
	 * @returns {BoundaryRange} modified `this`
	 */
	normalize(exclusive=true){
		if (exclusive){
			if (this.#start.side & FILTER_BEFORE)
				this.#start.previous();
			if (this.#end.side & FILTER_AFTER)
				this.#end.next();
		}
		else{
			if (this.#start.side & FILTER_AFTER)
				this.#start.next();
			if (this.#end.side & FILTER_BEFORE)
				this.#end.previous();
		}
		return this;
	}

	// Comparison helper methods
	/** Check if this range intersects with another
	 * @param {BoundaryRange} other the range to compare with
	 * @param {boolean} [inclusive=false] whether to consider the ranges intersecting if just
	 * 	one of their start/end anchors are equal
	 * @returns {boolean} true if the ranges intersect
	 */
	intersects(other, inclusive=false){
		return (
			this.start.compare(other.end) <= (inclusive-1) &&
			this.end.compare(other.start) >= (1-inclusive)
		);
	}
	/** Check if this range fully contains `other`
	 * @param {BoundaryRange} other the range to compare with
	 * @param {boolean} [inclusive=true] whether to consider the range fully contained if one of
	 * 	its start/end anchors equals that of `this`
	 * @returns {boolean} true if `other` is contained
	 */
	contains(other, inclusive=true){
		return (
			this.start.compare(other.start) <= (inclusive-1) &&
			this.end.compare(other.end) >= (1-inclusive)
		);
	}
}

// could maybe rename it to NodeBoundaryXXX
const Flags_readonly = Object.freeze(Flags);
export { Flags_readonly as BoundaryFlags, Boundary, BoundaryRange };
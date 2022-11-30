# node-boundary

A better interface for DOM anchors and ranges:

- Allows working with anchors directly, rather than using a collapsed `Range`
- Anchors and ranges don't change positions with DOM mutations
- Clean interfaces for comparison and traversal
- Interoperable with `Range` and `StaticRange`

[API documentation](https://azmisov.github.io/node-boundary) |
[npm package](https://www.npmjs.com/package/node-boundary) |
[GitHub source code](https://www.github.com/Azmisov/node-boundary)

## Installation

```
npm i node-boundary
```

This project uses ES 2015+ class features. A Babel transpiled and minified version is provided as
`boundary.compat.min.js`, with exports under `NodeBoundary`; though I highly recommend building a
bundle yourself to customize the target and reduce code size. A plain minified version is provided
as `boundary.min.js`.

## Usage

```js
// an alias is recommended for BoundaryFlags
import { Boundary, BoundaryRange, BoundaryFlags as F} from "node-boundary";
```

### Boundary

Use a {@link Boundary} object to represent a position, or *anchor*, inside the DOM. A position in
the DOM is given by a reference {@link Boundary#node|node}, and a {@link Boundary#side|side}
relative to that node. It is called a "boundary" because the position is tied to a node's
inner/outer bounds. For example:

```html
A<main>B <article> </article> C</main>D
```
```js
const main = document.querySelector("main");
const A = new Boundary(main, BoundaryFlags.BEFORE_OPEN);
const B = new Boundary(main, BoundaryFlags.AFTER_OPEN);
const C = new Boundary(main, BoundaryFlags.BEFORE_CLOSE);
const D = new Boundary(main, BoundaryFlags.AFTER_CLOSE);
```

The letters A-D give the possible positions relative to the `main` reference node:
- A: {@link BoundaryFlags.BEFORE_OPEN|BEFORE_OPEN} outside the node, immediately preceding
- B: {@link BoundaryFlags.AFTER_OPEN|AFTER_OPEN} inside the node, before any child nodes
- C: {@link BoundaryFlags.BEFORE_CLOSE|BEFORE_CLOSE} inside the node, after any child nodes
- D: {@link BoundaryFlags.AFTER_CLOSE|AFTER_CLOSE} outside the node, immediately following

Two boundaries can have the same position, but differ in the reference node they are attached to.
See {@link Boundary#isAdjacent}. For example:

```html
<main>A B<article> </article> </main>
```
```js
const main = document.querySelector("main");
const article = document.querySelector("article");
const A = new Boundary(main, BoundaryFlags.AFTER_OPEN);
const B = new Boundary(article, BoundaryFlags.BEFORE_OPEN);
A.isAdjacent(B); // true
```

Contrast this encoding with using a collapsed `Range`; a `Range` specifies a position as a relative
offset into a node's `childNodes` list. There is no way to encode *"before a node"* or *"at the end
of a node"*, since added/removed children will invalidate the position. The position given by a
`Boundary` on the other hand will not change with DOM mutations.


### BoundaryRange

Use a {@link BoundaryRange} object to represent a range between two positions. Internally, this is
represented by a starting and ending {@link Boundary}. You may access the start/end boundary directly
and perform operations on it, which conveniently simplifies many of the operations that you use on
`Range`.

A {@link BoundaryRange} is akin to a `StaticRange`, in that it does not validate that the start/end
anchors belong to the same DOM tree or that end follows start. However, unlike `StaticRange`, you
are still able to operate and modify the range as needed. The idea is the range can continue to be
used despite any DOM mutations. Some of the comparison and update operations will access the current
DOM (e.g. {@link BoundaryRange#extend|extend}, {@link BoundaryRange#toRange|toRange}, {@link
BoundaryRange#normalize|normalize}), so just be wary of this when dealing with mutating DOM's.

While many of the `Range` interfaces methods have been implemented on `BoundaryRange`,
some more computationally heavy ones have not. For these, you can always convert to a `Range` to
perform the operation, provided the start/end anchors are properly ordered. For example:

```js
const range = boundary.toRange();
range.extractContents();
range.getClientRects();
```

### Examples

Inserting a `span` before every node. See {@link Boundary#nextNodes|nextNodes}, {@link
Boundary#insert|insert}.

```html
<main><div></div><div></div></main>
```
```js
const b = new Boundary(document.body, BoundaryFlags.AFTER_OPEN);
for (const _ of b.nextNodes()){
	if (b.side === BoundaryFlags.BEFORE_OPEN)
		b.insert(document.createElement("span"));
}
```

Iterating all **element** boundaries within a node. See {@link
BoundaryRange#selectNodeContents|selectNodeContents}, {@link Boundary#isEqual|isEqual}.
```html
<main>
	<div></div>
	<div></div>
</main>
```
```js
const r = new BoundaryRange();
r.selectNodeContents(document.querySelector("main"));
while (true) {
	if (r.start.node.nodeType == Node.ELEMENT_NODE)
		console.log(r.start.node, r.end.side);
	if (r.start.isEqual(r.end))
		break;
	r.start.next();
}
```

Getting the combined extent of two ranges. See {@link BoundaryRange#setStart|setStart}, {@link
BoundaryRange#setEnd|setEnd}, {@link BoundaryRange#selectNode|selectNode}, {@link
BoundaryRange#extend|extend}
```html
<main>
	<aside></aside>
	<article></article>
</main>
```
```js
const main = document.querySelector("main");
const aside = main.firstElementChild;
const article = main.lastElementChild;

const r1 = new BoundaryRange();
r1.setStart(main, BoundaryFlags.AFTER_OPEN).setEnd(aside, BoundaryFlags.BEFORE_CLOSE);
const r2 = new BoundaryRange();
r2.selectNode(article);
r1.extend(r2);

// result is a combination of the two ranges
r1.start.isEqual(new Boundary(main, BoundaryFlags.AFTER_OPEN)); // true
r1.end.isEqual(new Boundary(article, BoundaryFlags.AFTER_CLOSE));  // true
```

Checking if a position is inside a range. See {@link Boundary#compare|compare}
```html
<main>Lorem ipsum</main>
```
```js
const main = document.querySelector("main"); 
const txt = main.firstChild;

const r = (new BoundaryRange()).selectNode(main);
const b = new Boundary(txt, BoundaryFlags.BEFORE_OPEN);
if (b.compare(r.start) >= 0 && b.compare(r.end) <= 0)
	console.log("inside range");
```

Robustness of range to DOM modifications.
```html
<main></main>
```
```js
const main = document.querySelector("main");
const r = (new BoundaryRange()).selectNodeContents(main);

// add some nodes
for (let i=0; i<5; i++)
	main.appendChild(document.createElement("span"))
// extracted contents will contain all spans
console.log(r.toRange().extractContents());
```





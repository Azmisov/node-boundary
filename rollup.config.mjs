import babel from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from "@rollup/plugin-terser";

export default [
	{
		input: "boundary.mjs",
		output: {
			file: "boundary.compat.min.js",
			name: "NodeBoundary",
			format: "iife"
		},
		plugins: [
			babel({ babelHelpers: 'bundled' }),
			nodeResolve(),
			terser()
		]
	},
	{
		input: "boundary.mjs",
		output: {
			file: "boundary.min.mjs"
		},
		plugins: [ terser() ]
	}
];
// Source - https://stackoverflow.com/a/49375928
// Posted by btzr, modified by community. See post 'Timeline' for change history
// Retrieved 2026-03-26, License - CC BY-SA 3.0
const api_url = process.env.BASE_API_URL || "http://localhost:3000/api";
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: './index.js',
    output: {
        path: path.resolve(__dirname, "./dist"),
        filename: "index_bundle.js",
    },
    plugins: [
        new HtmlWebpackPlugin({
            inject: true,
            template: './index.html',
            templateParameters: {
                apiUrl: api_url,
            },
        }),
    ],
}

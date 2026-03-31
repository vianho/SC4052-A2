// Source - https://stackoverflow.com/a/49375928
// Posted by btzr, modified by community. See post 'Timeline' for change history
// Retrieved 2026-03-26, License - CC BY-SA 3.0
const api_url = process.env.BASE_API_URL || "http://localhost:3000/api";
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

console.log(`Using API URL: ${api_url}`);

module.exports = {
    entry: './index.js',
    output: {
        path: path.resolve(__dirname, "./dist"),
        filename: "index_bundle.js",
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: [MiniCssExtractPlugin.loader, 'css-loader'],
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            inject: true,
            template: './index.html',
            templateParameters: {
                apiUrl: api_url,
            },
        }),
        new MiniCssExtractPlugin({
            filename: '[name].css',
            chunkFilename: '[id].css',
        }),
    ],
}
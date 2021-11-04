const dotenv = require('dotenv').config();
const crypto = require('crypto');
const cookie = require('cookie');
const cheerio = require('cheerio');
const htmlparser2 = require('htmlparser2');
const nonce = require('nonce')();
const querystring = require('querystring');
const fetch = require('node-fetch');
const shopifyService = require('../services/shopifyService');
const complianceService = require('../services/complianceService');
const Shop = require("../models/shop");
const Subscription = require("../models/subscription");
const UsageCharge = require("../models/usageCharge");
const Brand = require("../models/brand");
const Product = require("../models/product");
const Order = require("../models/order");
const Webhook = require("../models/webhook");
const { response } = require('express');
const moment = require('moment');
const { callbackify } = require('util');
const e = require('express');
const order = require('../models/order');
const { Console } = require('console');

const scopes = 'read_products,write_products,read_orders,read_script_tags,write_script_tags,read_themes,write_themes,read_customers';
const forwardingAddress = process.env.SHOPIFY_FORWARDING_ADDRESS;
const apiKey = process.env.SHOPIFY_API_KEY;

const error = new Error();
error.status = 'NOT_FOUND';
error.message = null;

const shopifyApiService = {
    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    install: async (req, res) => {
        const shop = req.query.shop;
        if (shop) {
            const state = nonce();
            const redirectUri = forwardingAddress + '/shopify/callback';
            const _installUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&state=${state}&redirect_uri=${redirectUri}`;
            res.cookie('state', state, { sameSite: 'none', secure: true });
            res.redirect(_installUrl);
        }
        else {
            res.status(200).render("install", { forwardingAddress: forwardingAddress });
        }
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    policy: async (req, res) => {
        res.status(200).render("privacy");
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    setupInstructions: async (req, res) => {
        res.status(200).render("setupInstructions");
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    howToUse: async (req, res) => {
        res.status(200).render("howToUse");
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    plans: async (req, res) => {
        const shop = req.query.shop;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(response) {
                res.status(200).render("plans", { shop: shop, forwardingAddress: forwardingAddress, apiKey: apiKey, subscription_status: response.subscription_status});
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    videoGuide: async (req, res) => {
        res.status(200).render("videoGuide");
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    installation: async (req, res) => {
        const shop = req.query.shop;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(response) {
                const theme = await shopifyService.themes(shop, response.accessToken);
                let role = "";
                let data = {
                    "items": theme.themes.map(item => {
                        if(item.role == 'main') {
                            role = item.role.toUpperCase();
                        }
                        return {
                            "id": item.id,
                            "role": role,
                            "name": item.name
                        };
                    }),
                }
                res.status(200).render("installation", { shop: shop, forwardingAddress: forwardingAddress, apiKey: apiKey, themes: data.items });
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    enableTheme: async (req, res) => {
        const shop = req.body.shop;
        const theme_id = req.body.theme_id;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(response) {
                let options = {
                    withDomLvl1: true,
                    normalizeWhitespace: false,
                    xmlMode: true,
                    decodeEntities: false
                }
                const theme = await shopifyService.getAssetContent(shop, theme_id, response.accessToken);
                let htVal = theme.asset.value;
                const dom = htmlparser2.parseDOM(htVal, options);
                const $ = cheerio.load(dom,{ decodeEntities: false });
                const check = $("script[src='"+process.env.SHOPIFY_FORWARDING_ADDRESS+"/shopify/js/customScripts.js']").length;
                if(check > 0) {
                    $("script[src='"+process.env.SHOPIFY_FORWARDING_ADDRESS+"/shopify/js/customScripts.js']").remove();
                    $('#box-check').remove();
                }
                $('body').append('<span id="box-check">{% assign boxcheck_count = 0 %}{% for item in cart.items %}{% assign productType = item.product.type | downcase %}{% if productType == "beer" or productType == "fortified wine" or productType == "non-alcohol food" or productType == "non-alcohol merchandise" or productType == "sparkling" or productType == "spirit" or productType == "wine" %}{% assign boxcheck_count = boxcheck_count | plus: 1 %}{% endif %}{% endfor %}{% if boxcheck_count > 0 %}<style>input[name="checkout"],button[name="checkout"],.btn::after,button[data-testid="Checkout-button"]{display: none !important;}</style><script src="'+process.env.SHOPIFY_FORWARDING_ADDRESS+'/shopify/js/customScripts.js"></script>{% endif %}</span>');
                const add = await shopifyService.addscriptAsset(shop, $.html() , theme_id, response.accessToken);
                return res.status(200).json($.html());
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    disableTheme: async (req, res) => {
        const shop = req.body.shop;
        const theme_id = req.body.theme_id;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(response) {
                let options = {
                    withDomLvl1: true,
                    normalizeWhitespace: false,
                    xmlMode: true,
                    decodeEntities: false
                }
                const theme = await shopifyService.getAssetContent(shop, theme_id, response.accessToken);
                let htVal = theme.asset.value;
                const dom = htmlparser2.parseDOM(htVal, options);
                const $ = cheerio.load(dom,{ decodeEntities: false });
                var script = $("script[src='"+process.env.SHOPIFY_FORWARDING_ADDRESS+"/shopify/js/customScripts.js']").length;
                if(script > 0) {
                    $("script[src='"+process.env.SHOPIFY_FORWARDING_ADDRESS+"/shopify/js/customScripts.js']").remove();
                    $('#box-check').remove();
                }
                const add = await shopifyService.addscriptAsset(shop, $.html() , theme_id, response.accessToken);
                return res.status(200).json(true);
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    auth: async (req, res) => {
        const { shop, hmac, code, state } = req.query;
        
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if (err)
                res.send(err);
            if (!response) {
                const shopifyAccessToken = await shopifyService.verifyShopifyRequest(req, res);
                if (!shopifyAccessToken) {
                    res.status(401).send("Could not verify request.");
                }
                res.status(200).render("redirect", { shop: shop, forwardingAddress: forwardingAddress, apiKey: apiKey });
            }
            else {
                if(response.is_verified == 1 && response.subscription_status === true) {
                    let orders = [];
                    let brands = [];
                    let cursors = [];
                    let brandCursors = [];
                    let complianceFieldsResponse = [];
                    
                    const shopifyOrders = await shopifyService.shopifyOrders(shop, response.accessToken);
                    const shopifyBrands = await shopifyService.shopifyBrands(shop, response.accessToken);
                    const brandArray = shopifyBrands.data.collections.edges;
                    const myArray = shopifyOrders.data.orders.edges;
                    if(myArray.length > 0) {
                        orders = await shopifyApiService.shopifyOrderResponse(shopifyOrders, shop);
                        cursors = await shopifyApiService.firstAndLast(myArray);
                    }
                    if(brandArray.length > 0) {
                        brands = await shopifyApiService.shopifyBrandResponse(shopifyBrands, shop);
                        brandCursors = await shopifyApiService.firstAndLast(brandArray);
                    }
                    const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                    const containerTypes = await complianceService.containerTypes(accessToken.data);
                    const varietals = await complianceService.varietals(accessToken.data);
                    const vintages = await complianceService.vintages(accessToken.data);
                    const unitSizes = await complianceService.unitSizes(accessToken.data);
                    const unitNumbers = await complianceService.unitNumbers(accessToken.data);
                    if(containerTypes.error === false && varietals.error === false && vintages.error === false && unitSizes.error === false && unitNumbers.error === false) {
                         complianceFieldsResponse = await shopifyApiService.complianceFieldsResponse(containerTypes, varietals, vintages, unitSizes, unitNumbers);
                    }
                    res.status(200).render("index", { 
                        shop: shop, 
                        forwardingAddress: forwardingAddress, 
                        apiKey: apiKey,
                        verified: response.is_verified,
                        shopifyOrders: orders, 
                        cursors: cursors,
                        fields: complianceFieldsResponse,
                        rulesSettings: response.runComplianceRules,
                        shipmentFlag: response.createShipment,
                        shopifyBrands: brands,
                        brandCursors: brandCursors
                    });
                }
                else if(response.subscription_status === false) {
                    res.redirect('plans?shop='+shop);
                }
                else {
                    res.status(200).render("login", { shop: shop, forwardingAddress: forwardingAddress, apiKey: apiKey });
                }
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    login: async (req, res) => {
        const shop = req.query.shop;
        res.status(200).render("login", { shop: shop, forwardingAddress: forwardingAddress, apiKey: apiKey });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    createBrand: async (req, res) => {
        console.log('------Create brand webhook heard------');
        const shop = req.headers['x-shopify-shop-domain'];
        const shopData = await Shop.find({
            shopname: shop
        });
        if(shopData.length === 0) {
            return res.status(200).send('ok');
        }
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        const accessToken = await complianceService.verifyComplianceRequest(shopData[0].api_username,shopData[0].api_password);
        if (!accessToken) {
            return res.status(200).send("Could not verify request.");
        }
        let dataString = {
            "name": payload.title,
        };
        let boxcheck_status = false;
        const brand = await complianceService.createBrand(accessToken.data, dataString);
        console.log(JSON.stringify(brand));
        if (brand.error === true) {
            boxcheck_status = false;
            const checkBrandSyncStatus = await shopifyService.checkBrandSyncStatus(payload.title, shop);
            if(checkBrandSyncStatus === null) {
                const saveBrand = await complianceService.savedbBrand(payload.id, payload.title, shop, boxcheck_status);
            }
        }
        else {
            boxcheck_status = true;
            const saveBrand = await complianceService.savedbBrand(payload.id, payload.title, shop, boxcheck_status);
        }
        return res.status(200).send('ok');
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    updateBrand: async (req, res) => {
        console.log('------Update brand webhook heard------');
        const shop = req.headers['x-shopify-shop-domain'];
        const shopData = await Shop.find({
            shopname: shop
        });
        if(shopData.length === 0) {
            return res.status(200).send('ok');
        }
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        const accessToken = await complianceService.verifyComplianceRequest(shopData[0].api_username,shopData[0].api_password);
        if (!accessToken) {
            return res.status(200).send("Could not verify request.");
        }
        let brand_name = await complianceService.findBrand(payload.id, shop);
       
        let dataString = {
            "name": payload.title,
        };
        if(brand_name !== null) {
            const brand = await complianceService.updateBrand(accessToken.data, brand_name.brand_title, dataString);
            console.log(JSON.stringify(brand));
            if(brand.error === false) {
                let boxcheck_status = true;
                let update_brand = await complianceService.updatedbBrand(payload.id, shop, payload.title, boxcheck_status);
            }
            return res.status(200).send('ok');
        }
        else {
            return res.status(200).send('ok');
        }
        
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    deleteBrand: async (req, res) => {
        console.log('------Delete brand webhook heard------');
        const shop = req.headers['x-shopify-shop-domain'];
        const shopData = await Shop.find({
            shopname: shop
        });
        if(shopData.length === 0) {
            return res.status(200).send('ok');
        }
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        const accessToken = await complianceService.verifyComplianceRequest(shopData[0].api_username,shopData[0].api_password);
        if (!accessToken) {
            return res.status(200).send("Could not verify request.");
        }
        let brand_name = await complianceService.findBrand(payload.id, shop);
        
        
        if(brand_name !== null) {

            let dataString = {
                "name": brand_name.brand_title,
                "status": "Archive"
            };

            const brand = await complianceService.updateBrand(accessToken.data, brand_name.brand_title, dataString);
            console.log(JSON.stringify(brand));
            let delete_brand = await complianceService.deletedbBrand(payload.id, shop);
            return res.status(200).send('ok');
        }
        else {
            return res.status(200).send('ok');
        }
        
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    createOrder: async (req, res) => {
        console.log('------Create order webhook heard------');
        const shop = req.headers['x-shopify-shop-domain'];
        const shopData = await Shop.find({
            shopname: shop
        });
        if(shopData.length === 0) {
            return res.status(200).send('ok');
        }
        let rules = {
            runComplianceRules: shopData[0].runComplianceRules,
            createShipment: shopData[0].createShipment,
        }
        
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        const accessToken = await complianceService.verifyComplianceRequest(shopData[0].api_username,shopData[0].api_password);
        if (!accessToken) {
            return res.status(200).send("Could not verify request.");
        }
        let dataString = await shopifyApiService.transformOrderObject(payload, rules);
        console.log(JSON.stringify(dataString));
        let boxcheck_status = false;
        const order = await complianceService.createOrder(accessToken.data, dataString);
        console.log(JSON.stringify(order));
        if (order.error === true) {
            boxcheck_status = false;
            const checkSyncStatus = await shopifyService.checkSyncStatus(dataString.orderNumber, shop);
            if(checkSyncStatus === null) {
                const saveOrder = await shopifyService.createdbOrder(dataString, shop, boxcheck_status);
            }   
        }
        else {
            boxcheck_status = true;
            const orderResponse = await complianceService.getOrderDetail(dataString.orderNumber, accessToken.data);
            if(shopData[0].childAccount === null) {
                const updateShopChild = await shopifyService.updateShopChild(orderResponse.data.childAccount, shop);
            }
            if(orderResponse.data.compliance.rulesWithMessages.length > 0) {
                const charge = await shopifyApiService.appRulesCharge(shop, dataString.orderNumber);
            }
            const saveOrder = await shopifyService.createdbOrder(dataString, shop, boxcheck_status);
        }
        return res.status(200).send('ok');
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    edited: async (req, res) => {
        console.log('------Update order webhook heard------');
        const shop = req.headers['x-shopify-shop-domain'];
        const shopData = await Shop.find({
            shopname: shop
        });
        if(shopData.length === 0) {
            return res.status(200).send('ok');
        }
        let rules = {
            runComplianceRules: shopData[0].runComplianceRules,
            createShipment: shopData[0].createShipment,
        }
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        const partialOrder = await shopifyService.partialOrder(shop, payload.order_edit.order_id, shopData[0].accessToken);
        
        const accessToken = await complianceService.verifyComplianceRequest(shopData[0].api_username,shopData[0].api_password);
        if (!accessToken) {
            return res.status(200).send("Could not verify request.");
        }
        let dataString = await shopifyApiService.transformOrderObject(partialOrder.order,rules);
        const order = await complianceService.updateOrderfulfillment(accessToken.data, dataString, partialOrder.order.order_number);
        console.log(JSON.stringify(order));
        if (order.error === true) {
            return res.status(200).send('error occurred');
        }
        else {
            return res.status(200).send('ok');
        }
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    orderStatus: async (req, res) => {
        console.log('------Order payment status update webhook heard------');
        const shop = req.headers['x-shopify-shop-domain'];
        const shopData = await Shop.find({
            shopname: shop
        });
        if(shopData.length === 0) {
            return res.status(200).send('ok');
        }
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        const accessToken = await complianceService.verifyComplianceRequest(shopData[0].api_username,shopData[0].api_password);
        if (!accessToken) {
            return res.status(200).send("Could not verify request.");
        }

        let orderStatus = '';

        if(payload.financial_status === 'authorized' && payload.fulfillment_status === null) {
            orderStatus = "Payment Received";
        }
        else if(payload.financial_status === 'paid' && payload.fulfillment_status === null) {
            orderStatus = "Payment Received";
        }
        else if(payload.financial_status === 'paid' && payload.fulfillment_status === 'fulfilled') {
            orderStatus = "Completed";
        }
        else if(payload.financial_status === 'voided') {
            orderStatus = "Cancelled";
        }
        else if(payload.financial_status === 'partially_paid') {
            orderStatus = "Payment Pending";
        }

        let dataString = {
            "orderStatus": orderStatus,
        };
        
        const order = await complianceService.updateOrderStatus(accessToken.data, dataString, payload.order_number);
        console.log(JSON.stringify(order));
        if (order.error === true) {
            return res.status(200).send('ok');
        }
        else {
            return res.status(200).send('ok');
        }
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    orderfulfilled: async (req, res) => {
        console.log('------Fulfill order webhook heard------');
        const shop = req.headers['x-shopify-shop-domain'];
        const shopData = await Shop.find({
            shopname: shop
        });
        if(shopData.length === 0) {
            return res.status(200).send('ok');
        }
        let rules = {
            runComplianceRules: shopData[0].runComplianceRules,
            createShipment: true,
        }
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        const accessToken = await complianceService.verifyComplianceRequest(shopData[0].api_username,shopData[0].api_password);
        if (!accessToken) {
            return res.status(200).send("Could not verify request.");
        }

        let dataString = await shopifyApiService.transformOrderObject(payload, rules);
        console.log(JSON.stringify(dataString));
        const order = await complianceService.updateOrderfulfillment(accessToken.data, dataString, payload.order_number);
        console.log(JSON.stringify(order));
        if (order.error === true) {
            return res.status(200).send('ok');
        }
        else {
            return res.status(200).send('ok');
        }
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    addOptions: async (req, res) => {
        let count = 0;
        const shop = req.body.shop;
        const productID = req.body.productID;
        const method = req.body.method;
        let productSKU = req.body.productSKU;
        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if (!err) {
                let dataString = await shopifyApiService.transformProductObject(req.body);
                const complianceAccessToken = await complianceService.verifyComplianceRequest(response[0].api_username,response[0].api_password);
                if (!complianceAccessToken) {
                    return res.status(401).json("Could not verify request.");
                }

                if(method === 'post') {
                    const syncProduct = await complianceService.createProduct(complianceAccessToken.data, dataString);
                    if (syncProduct.error === false) {
                        const productCustomMeta = await shopifyApiService.productMetaFields(req.body);
                        do {
                            let updateMeta = await shopifyService.productMetaFields(shop, response[0].accessToken, productID, productCustomMeta[count]);
                            count = count + 1;
                        }
                        while (count < productCustomMeta.length);
                        const savedbProduct = await complianceService.savedbProduct(productID , productSKU, shop);
                        return res.status(200).json(syncProduct);
                    }
                    else {
                        return res.status(200).json(syncProduct);
                    }
                }
                else {
                    
                    let dbProduct = await complianceService.findProduct(productID, shop);
                    
                    if(dbProduct !== null) {
                       productSKU = dbProduct.product_sku;
                    }
                    const syncProduct = await complianceService.updateProduct(complianceAccessToken.data, dataString, productSKU);
                    if (syncProduct.error === false) {
                        const productCustomMeta = await shopifyApiService.productMetaFields(req.body);
                        do {
                            let updateMeta = await shopifyService.productMetaFields(shop, response[0].accessToken, productID, productCustomMeta[count]);
                            count = count + 1;
                        }
                        while (count < productCustomMeta.length);
                        const updatedbProduct = await complianceService.updatedbProduct(productID , shop, req.body.productSKU);
                        return res.status(200).json(syncProduct);
                    }
                    else {
                        return res.status(200).json(syncProduct);
                    }
                }   
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    editOptions: async (req, res) => {
        let count = 0;
        const shop = req.body.shop;
        const productID = req.body.productID;
        const productType = req.body.productType;

        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if (!err) {
                let status = false;
                let taxCodes = null;
                const fetchProductMetaById = await shopifyService.fetchProductMetaById(shop, productID, response[0].accessToken);
                const accessToken = await complianceService.verifyComplianceRequest(response[0].api_username, response[0].api_password);
                let dbProduct = await complianceService.findProduct(productID, shop);
                if(productType) {
                    taxCodes = await complianceService.taxCodes(productType, accessToken.data);
                }
                if(dbProduct !== null) {
                    status = true;
                }
                let data = {
                    status: status,
                    result: fetchProductMetaById.metafields,
                    taxCodes: taxCodes
                }
                return res.status(200).json(data);
            }
        });
    },

    /**
     * @param order
     * @param runComplianceRules
     * @returns {Promise<*>}
     */
    transformOrderObject: async (order, rules) => {
        let orderStatus = "";
        let trackingNumber = "";
        let trackingCompany = "";
        let fulfillmen_date = "";
        let purchaser_dob = "";
        let recipient_dob = "";
        let product_return = "";
        let orderTotal = "";
        let productTotal = "";

        if(order.financial_status === 'authorized' && order.fulfillment_status === null) {
            orderStatus = "Payment Received";
        }
        else if(order.financial_status === 'paid' && order.fulfillment_status === null) {
            orderStatus = "Payment Received";
        }
        else if(order.financial_status === 'paid' && order.fulfillment_status === 'fulfilled') {
            orderStatus = "Completed";
        }
        else if(order.financial_status === 'voided') {
            orderStatus = "Cancelled";
        }
        else if(order.financial_status === 'partially_paid') {
            orderStatus = "Payment Pending";
        }
        if(order.fulfillments.length > 0) {
            trackingNumber = order.fulfillments[0].tracking_number;
            trackingCompany = order.fulfillments[0].tracking_company;
            fulfillmen_date = moment(order.fulfillments[0].created_at).format('MM-DD-YYYY');
        }
        if(order.note_attributes.length > 0) {
            order.note_attributes.map(val => {
                if(val.name == 'purchaser_dob') {
                    purchaser_dob = moment(val.value).format('MM-DD-YYYY');
                }
                if(val.name == 'recipient_dob') {
                    recipient_dob = moment(val.value).format('MM-DD-YYYY');
                }
            });
        }

        if(orderStatus === 'Completed') {
            product_return = order.fulfillments[0].line_items.map(fulfillment_item => {
                return {
                    "productSKU": fulfillment_item.sku,
                    "name": fulfillment_item.title,
                    "quantity": fulfillment_item.quantity,
                    "soldUnitPrice": fulfillment_item.price
                };
            });
        }
        else {
            let newArr = order['line_items'].filter(function (item) {
                return item.fulfillable_quantity > 0;
            });
            product_return = newArr.map(item => {
                return {
                    "productSKU": item.sku,
                    "name": item.title,
                    "quantity": item.fulfillable_quantity,
                    "soldUnitPrice": item.price
                };
            }); 
        }
        console.log(product_return);
        if(order.current_total_price === undefined && order.current_subtotal_price === undefined) {
            orderTotal = order.total_price;
            productTotal = order.subtotal_price;
        }
        else {
            orderTotal = order.current_total_price;
            productTotal = order.current_subtotal_price;
        }

        let orderData = {
            "orderNumber": order.order_number,
            "orderStatus": orderStatus,
            "orderDate": moment(order.created_at).format('MM-DD-YYYY'),
            "purchaser": {
                "firstName": order.billing_address.first_name,
                "lastName": order.billing_address.last_name,
                "company": order.billing_address.company,
                "address1": order.billing_address.address1,
                "address2": order.billing_address.address2,
                "city": order.billing_address.city,
                "state": order.billing_address.province_code,
                "country": order.billing_address.country,
                "zip": order.billing_address.zip,
                "email": order.email,
                "mobilePhone": order.billing_address.phone,
                "dob": purchaser_dob,
                "textOptIn": "Unknown",
                "emailOptIn": "Unknown"
            },
            "recipient": {
                "firstName": order.shipping_address.first_name,
                "lastName": order.shipping_address.last_name,
                "company": order.shipping_address.company,
                "address1": order.shipping_address.address1,
                "address2": order.shipping_address.address2,
                "city": order.shipping_address.city,
                "state": order.shipping_address.province_code,
                "country": order.shipping_address.country,
                "zip": order.shipping_address.zip,
                "email": order.email,
                "mobilePhone": order.shipping_address.phone,
                "dob": recipient_dob,
                "textOptIn": "Unknown",
                "emailOptIn": "Unknown"
            },
            "carrier": {
                "name": 'UPS',
                "userCode": "GND",
                "tracking": trackingNumber,
            },
            "merchantId": "",
            "deliveryDate": fulfillmen_date,
            "packageWeight": "",
            "totalShipment": order.total_shipping_price_set.shop_money.amount,
            "products": product_return,
            "orderTotal": orderTotal,
            "productTotalPrice": productTotal,
            "totalDiscount": order.total_discounts,
            "productSalesTaxCollected": order.total_tax,
            "freightTotal": order.total_shipping_price_set.shop_money.amount,
            "freightSalesTaxCollected": 0,
            "salesTaxTotal": 0,
            "midNumber": "",
            "payment": {
                "date": moment(order.created_at).format('MM-DD-YYYY')
            },
            "shipment": {
                "date": fulfillmen_date
            },
            "fulfillmentLocationName": "",
            "runComplianceRules": rules.runComplianceRules,
            "createShipment": rules.createShipment,
            "saveTax": false,
            "adjustmentReason": "",
            "adjustmentDescription": "",
            "code": "",
            "companyCode": "DEFAULT",
            "type": "SalesInvoice",
            "customerCode": order.email
        };

        return orderData;
    },

    /**
     * @param response
     * @returns {Promise<*>}
     */
    productMetaFields: async (response) => {
        let metaData = [
            {
                "metafield": {
                    "namespace": "compliance",
                    "key": "vintage",
                    "value": response.vintage,
                    "value_type": "string"
                }
            },
            {
                "metafield": {
                    "namespace": "compliance",
                    "key": "varietal",
                    "value": response.varietal,
                    "value_type": "string"
                }
            },
            {
                "metafield": {
                    "namespace": "compliance",
                    "key": "appellation",
                    "value": response.appellation,
                    "value_type": "string"
                }
            },
            {
                "metafield": {
                    "namespace": "compliance",
                    "key": "alcohol",
                    "value": response.alcohol,
                    "value_type": "string"
                }
            },
            {
                "metafield": {
                    "namespace": "compliance",
                    "key": "volumeUnitSize",
                    "value": response.volumeUnitSize,
                    "value_type": "string"
                }
            },
            {
                "metafield": {
                    "namespace": "compliance",
                    "key": "volumeUnitNumber",
                    "value": response.volumeUnitNumber,
                    "value_type": "string"
                }
            },
            {
                "metafield": {
                    "namespace": "compliance",
                    "key": "containerType",
                    "value": response.containerType,
                    "value_type": "string"
                }
            },
            {
                "metafield": {
                    "namespace": "compliance",
                    "key": "taxCode",
                    "value": response.taxCode,
                    "value_type": "string"
                }
            },
            {
                "metafield": {
                    "namespace": "compliance",
                    "key": "taxCodeDescription",
                    "value": response.taxCodeDescription,
                    "value_type": "string"
                }
            }
        ];

        return metaData;
    },

    /**
     * @param metaData
     * @returns {Promise<*>}
     */
    transformProductObject: async (metaData) => {
        let productData = {
            "productType": metaData.productType,
            "brand": metaData.brand,
            "productSKU": metaData.productSKU,
            "productName": metaData.productName,
            "vintage": metaData.vintage,
            "varietal": metaData.varietal,
            "appellation": metaData.appellation,
            "alcohol": metaData.alcohol,
            "retailPrice": metaData.retailPrice,
            "volumeUnitSize": metaData.volumeUnitSize,
            "volumeUnitNumber": metaData.volumeUnitNumber,
            "volumeUnitWeight": metaData.volumeUnitWeight,
            "containerType": metaData.containerType,
            "producedByAccount": true,
            "availableToMarketPlaces": true,
            "taxCode": metaData.taxCode,
            "taxCodeDescription": metaData.taxCodeDescription,
            "status": "Active"
        }

        return productData;
    },

    /**
     * @param data
     * @returns {Promise<*>}
     */
    transformArrayObject: async (data) => {
      return Object.assign(...data.map(({name, value}) => ({[name]: value})));
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    saveCredentials: async (req, res) => {
        console.log("------Save Client Credentials------")
        const username = req.body.username;
        const password = req.body.password;
        const shop = req.body.shop;
        const accessToken = await complianceService.verifyComplianceRequest(username, password);

        if(accessToken.error === true) {
            return res.json(accessToken);
        }
        else {
            Shop.findOneAndUpdate(
                {"shopname":shop}, 
                { 
                    $set: {'api_username':username,'api_password':password,is_verified: 1}
                },
                {
                    returnNewDocument: true
                }
            , function( error, result){
                if(!error) {
                    return res.json(accessToken);
                }
                else {
                    return res.json(error);
                }
            });
        }
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    uninstallApp: async (req, res) => {
        console.log("------App Uninstalled webhook heared------")
        const shop = req.headers['x-shopify-shop-domain'];
        console.log(shop);
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        const tables = [ Shop, Webhook, Subscription, UsageCharge];
        tables.forEach(function(item) {
            shopifyApiService.deleteRecords(item, shop)
        });
        return res.status(200).send('ok');
      },

    /**
     * @param table
     * @param shop
     * @returns {Promise<*>}
     */
    deleteRecords: async (table, shop) => {
        console.log(shop);
        table.deleteMany({ shopname: shop }).then(result => {
            console.log(result);
            return result;
        });
    },

    /**
     * @param myArray
     * @returns {Promise<*>}
     */
    firstAndLast: async (myArray) => {
        const firstItem = myArray[0];
        const lastItem = myArray[myArray.length-1];

        const objOutput = {
            first : firstItem.cursor,
            last : lastItem.cursor
        };

        return objOutput;
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    getOrderDetail: async (req, res) => {
        const orderID = req.body.order_no;
        const shop = req.body.shop;

        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response[0].api_username,response[0].api_password);
                const orderResponse = await complianceService.getOrderDetail(orderID, accessToken.data);
                if(orderResponse.error === false) {
                    let trackingResponse = null;
                    let rulesEngine = false;
                    let shippingLabels = false;
                    let shipmentCost = null;
                    let composeComplianceStatus = null;
                    let complianceHistoryStatus = null;

                    const shopResponse = await shopifyService.shop(shop, response[0].accessToken);
                    let dataString = await shopifyApiService.transformCostObject(orderResponse, shopResponse, orderResponse.data.packageWeight);
                    const shippingCost = await complianceService.shippingCost(dataString, accessToken.data);
                    if(shippingCost.error === false) {
                        let shippers = shippingCost.data.shipCosting.shippers;
                        shipmentCost = shippers.filter(function(v, i) {
                            return ((v["shipperID"] === "UPS" || v["shipperID"] === "UP3") || v["shipperID"] === "UP2" || v["shipperID"] === "UP1");
                        })
                    }
                    const productUsed = await complianceService.productUsed(accessToken.data);
                    if(productUsed.error === false) {
                        if(productUsed.data.shipping !== undefined) {
                            if(productUsed.data.shipping.length > 0) {
                                productUsed.data.shipping.forEach(function(item) {
                                    if(item === 'shipping_labels') {
                                        shippingLabels = true;
                                    }
                                });
                            }
                        }
                        if(productUsed.data.compliance !== undefined) {
                            if(productUsed.data.compliance.length > 0) {
                                productUsed.data.compliance.forEach(function(val) {
                                    if(val === 'rules_engine') {
                                        rulesEngine = true;
                                    }
                                });
                            }
                        }
                    }
                    if(orderResponse.data.carrier.tracking !== '') {
                        trackingResponse = await complianceService.getCurrentTracking(orderResponse.data.carrier.tracking, accessToken.data);
                    }

                    const complianceHistory = await complianceService.complianceHistory(orderID, orderResponse.data.parentAccount, orderResponse.data.childAccount, accessToken.data);
                    const composeCompliance = await complianceService.composeCompliance(orderID, orderResponse.data.parentAccount, orderResponse.data.childAccount, accessToken.data);
                    if(complianceHistory.message !== 'No record found' && composeCompliance.message !== 'No record found') {
                        complianceHistoryStatus =  complianceHistory.data[0];
                        composeComplianceStatus =  composeCompliance.data[0];
                    }
                    return await res.status(200).json({order: orderResponse.data, complianceHistory: complianceHistoryStatus, composeCompliance: composeComplianceStatus, trackingResponse: trackingResponse,rulesEngine: rulesEngine,shippingLabels: shippingLabels,shipmentCost: shipmentCost});
                }
                else {
                    return await res.status(200).json(false);
                }
            }   
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    getOrder: async (req, res) => {
        const orderID = req.body.order_no;
        const shop = req.body.shop;
        let boccheck_status = false;
        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const orderResponse = await shopifyService.getOrder(shop, orderID, response[0].accessToken);
                if(orderResponse.orders.length > 0) {
                    const checkSyncStatus = await shopifyService.checkSyncStatus(orderID, shop);
                    if(checkSyncStatus === null) {
                        boccheck_status = false;
                    }
                    else {
                        boccheck_status = checkSyncStatus.boccheck_status;
                    }
                    return res.status(200).json({order: orderResponse.orders[0], status: boccheck_status});
                }
                else {
                    return res.status(200).json(false);
                }
            }   
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    nextOrders: async (req, res) => {
        const cursor = req.body.cursor;
        const shop = req.body.shop;
        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const orderResponse = await shopifyService.nextOrders(shop, response[0].accessToken, cursor);
                const orders = await shopifyApiService.shopifyOrderResponse(orderResponse, shop);
                return res.json(orders);
            }   
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    previousOrders: async (req, res) => {
        const cursor = req.body.cursor;
        const shop = req.body.shop;
        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const orderResponse = await shopifyService.previousOrders(shop, response[0].accessToken, cursor);
                const orders = await shopifyApiService.shopifyOrderResponse(orderResponse, shop);
                return res.json(orders);
            }   
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    fetchProductByID: async (req, res) => {
        const shop = req.body.shop;
        const productID = req.body.productID;
        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const productRes = await shopifyService.fetchProductByID(shop, productID, response[0].accessToken);
                return res.json(productRes.product);
            }   
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    runCompliance: async (req, res) => {
        const orderNumber = req.body.orderNumber;
        const shop = req.body.shop;
        const parentAccount = req.body.parentAccount;
        const childAccount = req.body.childAccount;
        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response[0].api_username,response[0].api_password);
                const complianceResult = await complianceService.runCompliance(orderNumber, accessToken.data);
                if(complianceResult.error === false) {
                    const checkRuleCharge = await shopifyService.getRuleCharge(shop, orderNumber);
                    if(checkRuleCharge === null) {
                        const charge = await shopifyApiService.appRulesCharge(shop, orderNumber);
                    }
                    const complianceHistory = await complianceService.complianceHistory(orderNumber, parentAccount, childAccount, accessToken.data);
                    return await res.status(200).json(complianceHistory.data[0]);
                }
                else {
                    return await res.status(200).json(false);
                }
            }
            
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    getCollection: async (req, res) => {
        const shop = req.body.shop;
        const productID = req.body.productID;
        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const result = await shopifyService.getCollection(shop, productID, response[0].accessToken);
                if(result === false) {
                    return await res.status(200).json();
                }
                else {
                    return await res.status(200).json(result.collection.title);
                }
                
            }
            
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    fetchOrderNumber: async (req, res) => {
        const shop = req.body.shop;
        const orderID = req.body.orderID;
        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const result = await shopifyService.fetchOrderNumber(shop, orderID, response[0].accessToken);
                return res.status(200).json(result.order.name);
            }
        });
    },

    /**
     * @param response
     * @param shop
     * @returns {Promise<*>}
     */
    shopifyOrderResponse: async (response, shop) => {
        let orders = response.data.orders.edges;
        let data = [];
        let boxcheck_status = false;
        let orderData = await Promise.all(orders.map(async (data) => {
            let items = {};
            const checkSyncStatus = await shopifyService.checkSyncStatus(data.node.name.substring(1), shop);
            if(checkSyncStatus !== null) {
                boxcheck_status = checkSyncStatus.boxcheck_status;
            }
            else {
                boxcheck_status = false;
            }
            items.cursor   = data.cursor;
            items.id  = data.node.id.substring(data.node.id.lastIndexOf('/') + 1);
            items.name  = data.node.name;
            items.totalPrice    = data.node.totalPrice;
            items.date = moment(data.node.createdAt).format('MM-DD-YYYY');
            items.customer   = data.node.customer.defaultAddress.name;
            items.status = boxcheck_status;
            return items;
        }));
        data = {
            "hasPreviousPage": response.data.orders.pageInfo.hasPreviousPage,
            "hasNextPage": response.data.orders.pageInfo.hasNextPage,
            "orders": orderData,
        };
        return data;
    },

    /**
     * @param containerTypes
     * @param varietals
     * @param vintages
     * @param unitSizes
     * @param unitNumbers
     * @returns {Promise<*>}
     */
    complianceFieldsResponse: async (containerTypes, varietals, vintages, unitSizes, unitNumbers) => {
        let complianceFields = [];

            complianceFields = {
                'containerTypes': containerTypes.data.map(containerType => {
                    return {
                        "name": containerType.name,
                    };
                }),
                'varietals': varietals.data.map(varietal => {
                    return {
                        "name": varietal.name,
                    };
                }),
                'vintages': vintages.data.map(vintage => {
                    return {
                        "name": vintage.name,
                    };
                }),
                'unitSizes': unitSizes.data.map(unitSize => {
                    return {
                        "name": unitSize.name,
                        "size": unitSize.size
                    };
                }),
                'unitNumbers': unitNumbers.data.map(unitNumber => {
                    return {
                        "name": unitNumber.name,
                    };
                }),
            }

        return complianceFields;
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    customerRequest: async (req, res) => {
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        return res.status(200).send('ok');
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    customerRedact: async (req, res) => {
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        return res.status(200).send('ok');
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    shopRedact: async (req, res) => {
        const verified = shopifyService.verifyWebhook(req);
        if (!verified) {
            return res.status(200).send("Could not verify request.");
        }
        const data = JSON.stringify(req.body);
        const payload = JSON.parse(data);
        return res.status(200).send('ok');
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    searchAppellation: async (req, res) => {
        const shop = req.query.shop;
        const val = req.query.q;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                if(accessToken.error === false) {
                    const appellations = await complianceService.appellations(val, accessToken.data);
                    const appellationResponse = await shopifyApiService.appellationResponse(appellations.data);
                    return res.status(200).json({error: false, appellations: appellationResponse});
                }
                else {
                    return res.status(200).json({error: true});
                }
                
            }
            
        });
    },

    /**
     * @param response
     * @returns {Promise<*>}
     */
    appellationResponse: async (response) => {
        let count = response.data.length;
        let data = [];
            data = {
                "total_count": count,
                "items": response.data.map(item => {
                    return {
                        "id": item.appellation,
                        "appellation": item.appellation,
                    };
                }),
            };
        return data;
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    getLabel: async (req, res) => {
        console.log('------Label Generation------')
        const shop = req.body.shop;
        const orderNumber = req.body.orderNumber;
        const cubeNumber = req.body.cubeNumber;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                if(accessToken.error === false) {
                    const labels = await complianceService.getLabel(orderNumber, cubeNumber, accessToken.data);
                    console.log(JSON.stringify(labels));
                    if(labels.error === false) {
                        return res.status(200).json({error: false, aimTracking: labels.data});
                    }
                    else {
                        return res.status(200).json({error: true, aimTracking: labels});
                    }
                }
                else {
                    return res.status(200).json({error: true});
                }
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    downloadLabel: async (req, res) => {
        console.log('------Download Label------');
        const shop = req.body.shop;
        const labelPath = req.body.labelPath;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                if(accessToken.error === false) {
                    const labels = await complianceService.downloadLabel(labelPath, accessToken.data);
                    console.log(JSON.stringify(labels));
                    return res.status(200).json({error: false, path: labels.data});
                }
                else {
                    return res.status(200).json({error: true});
                }
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    refreshTracking: async (req, res) => {
        console.log('------Refresh Tracking------');
        const shop = req.body.shop;
        const trackingID = req.body.trackingID;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                if(accessToken.error === false) {
                    const tracking = await complianceService.getCurrentTracking(trackingID, accessToken.data);
                    console.log(JSON.stringify(tracking));
                    return res.status(200).json({error: false, aimTracking: tracking.data});
                }
                else {
                    return res.status(200).json({error: true});
                }
            }
        });
    },
    
    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    trackingHistory: async (req, res) => {
        const shop = req.body.shop;
        const trackingID = req.body.trackingID;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                if(accessToken.error === false) {
                    const trackingHistory = await complianceService.trackingHistory(trackingID, accessToken.data);
                    if(trackingHistory.error === false) {
                        return res.status(200).json({error: false, trackingHistory: trackingHistory});
                    }
                    else {
                        return res.status(200).json({error: true, trackingHistory: trackingHistory});
                    }
                }
                else {
                    return res.status(200).json({error: true});
                }
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    createShipment: async (req, res) => {
        console.log("------Manual Shipment Creation------");
        const shop = req.body.shop;
        const orderNumber = req.body.orderNumber;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                if(accessToken.error === false) {
                    const createShipment = await complianceService.createShipment(orderNumber, accessToken.data);
                    console.log(JSON.stringify(createShipment));
                    return res.status(200).json({shipmentResponse: createShipment});
                }
                else {
                    return res.status(200).json({error: true});
                }
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    settings: async (req, res) => {
        const runComplianceRules = req.body.runComplianceRules;
        const createShipment = req.body.createShipment;
        const shop = req.body.shop;
        Shop.findOneAndUpdate(
            {"shopname":shop}, 
            { 
                $set: {
                    'runComplianceRules':runComplianceRules,
                    'createShipment': createShipment
                }
            },
            {
                returnNewDocument: true
            }
        , function( error, result){
            if(!error) {
                return res.json({error: false});
            }
            else {
                return res.json({error: true});
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    syncOrder: async (req, res) => {
        console.log('------Create Manual Order------');
        const shop = req.body.shop;
        const orderNumber = req.body.orderNumber;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                if(accessToken.error === false) {
                    let rules = {
                        runComplianceRules: response.runComplianceRules,
                        createShipment: response.createShipment,
                    }
                    const orderResponse = await shopifyService.partialOrder(shop, orderNumber, response.accessToken);
                    let dataString = await shopifyApiService.transformOrderObject(orderResponse.order, rules);
                    const getOrderDetail = await complianceService.getOrderDetail(orderResponse.order.order_number, accessToken.data);
                    console.log(JSON.stringify(getOrderDetail));
                    if(getOrderDetail.error === true) {
                        const syncOrder = await complianceService.createOrder(accessToken.data, dataString);
                        if(syncOrder.error === false) {
                            const checkCharge = await complianceService.getOrderDetail(orderResponse.order.order_number, accessToken.data);
                            if(checkCharge.error === false) {
                                if(response.childAccount === null) {
                                    const updateShopChild = await shopifyService.updateShopChild(checkCharge.data.childAccount, shop);
                                }
                                if(checkCharge.data.compliance.rulesWithMessages.length > 0) {
                                    const charge = await shopifyApiService.appRulesCharge(shop, orderResponse.order.order_number);
                                }
                            }
                        }
                        return res.status(200).json({data: syncOrder});
                    }
                    else {
                        let status = true;
                        let DbResponse = {
                            orderNumber: orderResponse.order.order_number,
                        }
                        const checkSyncStatus = await shopifyService.checkSyncStatus(orderResponse.order.order_number, shop);
                        if(checkSyncStatus === null) {
                            const successResponse = await shopifyService.createdbOrder(DbResponse, shop, status);
                        }
                        else {
                            const updateResponse = await shopifyService.updatedbOrder(orderResponse.order.order_number, shop, status);
                        }
                        
                        const syncOrder = {
                            error: false
                        }
                        return res.status(200).json({data: syncOrder});
                    }
                }
                else {
                    return res.status(200).json({data: accessToken});
                }
            }
        });
    },

    /**
     * @param response
     * @param shop
     * @returns {Promise<*>}
     */
    shopifyBrandResponse: async (response, shop) => {
        let brands = response.data.collections.edges;
        let data = [];
        let boxcheck_status = false;
        let brandData = await Promise.all(brands.map(async (data) => {
            let items = {};
            const checkBrandSyncStatus = await shopifyService.checkBrandSyncStatus(data.node.title, shop);
            if(checkBrandSyncStatus !== null) {
                boxcheck_status = checkBrandSyncStatus.boxcheck_status;
            }
            else {
                boxcheck_status = false;
            }
            items.cursor   = data.cursor;
            items.id  = data.node.id.substring(data.node.id.lastIndexOf('/') + 1);
            items.title  = data.node.title;
            items.status = boxcheck_status;
            return items;
        }));
        data = {
            "hasPreviousPage": response.data.collections.pageInfo.hasPreviousPage,
            "hasNextPage": response.data.collections.pageInfo.hasNextPage,
            "brands": brandData,
        };
        return data;
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    nextBrands: async (req, res) => {
        const cursor = req.body.cursor;
        const shop = req.body.shop;
        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const brandResponse = await shopifyService.nextBrands(shop, response[0].accessToken, cursor);
                const brands = await shopifyApiService.shopifyBrandResponse(brandResponse, shop);
                return res.json(brands);
            }   
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    previousBrands: async (req, res) => {
        const cursor = req.body.cursor;
        const shop = req.body.shop;
        Shop.find({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const brandResponse = await shopifyService.previousBrands(shop, response[0].accessToken, cursor);
                const brands = await shopifyApiService.shopifyBrandResponse(brandResponse, shop);
                return res.json(brands);
            }   
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    syncBrand: async (req, res) => {
        console.log('------Maunual Brand Syncing------')
        const shop = req.body.shop;
        const title = req.body.title;
        const brand_id = req.body.brand_id;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                if(accessToken.error === false) {
                    let dataString = {
                        "name": title
                    }
                    const brand = await complianceService.createBrand(accessToken.data, dataString);
                    if(brand.error === true) {
                        return res.status(200).json({data: brand});
                    }
                    else {
                        let status = true;
                        const checkBrandSyncStatus = await shopifyService.checkBrandSyncStatus(title, shop);
                        if(checkBrandSyncStatus === null) {
                            const saveBrand = await complianceService.savedbBrand(brand_id, title, shop, status);
                        }
                        else {
                            let update_brand = await complianceService.updatedbBrand(brand_id, shop, title, status);
                        }
                        
                        const syncBrand = {
                            error: false
                        }
                        return res.status(200).json({data: syncBrand});
                    }
                }
                else {
                    return res.status(200).json({data: accessToken});
                }
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    subscription: async (req, res) => {
        console.log('------Shopify App subscription Charge------');
        const shop = req.body.shop;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const shopResponse = await shopifyService.shop(shop, response.accessToken);
                let charge_status = false;
                if(shopResponse.shop.plan_name === 'partner_test' || shopResponse.shop.plan_name === 'affiliate') {
                    charge_status = true;
                }
                const createSubscription = await shopifyService.createSubscription(shop, response.accessToken, charge_status);
                console.log(JSON.stringify(createSubscription));
                return res.status(200).json({error: false, subscriptions: createSubscription.data.appSubscriptionCreate});
            }
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    approveSubscription: async (req, res) => {
        console.log('------Approve Shopify App subscription------');
        const charge_id = req.query.charge_id;
        const shop = req.query.shop;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return res.json(err);
            }
            if(response) {
                const subscriptionStatus = await shopifyService.subscriptionStatus(shop, response.accessToken, charge_id);
                const checkSubscriptionStatus = await shopifyService.checkSubscriptionStatus(shop);
                if(checkSubscriptionStatus !== null) {
                    const updateSubscription = await shopifyService.updateSubscription(subscriptionStatus.data.node, shop, charge_id);
                }
                else {
                    const saveSubscription = await shopifyService.saveSubscription(subscriptionStatus.data.node, shop, charge_id);
                }
                let status = true;
                const updateShop = await shopifyService.updateShop(status, shop);
                res.redirect('callback?shop='+shop);
            }   
        });
    },

    /**
     * @param shop
     * @param orderNumber
     * @returns {Promise<*>}
     */
    appRulesCharge: async (shop, orderNumber) => {
        console.log('------Shopify App Compliance Rules Charge ------');
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return false;
            }
            if(response) {
                const subscriptionRecord = await shopifyService.checkSubscriptionStatus(shop);
                const record = await shopifyService.appUsageCharge(shop, response.accessToken, subscriptionRecord.charge_id, 0.99);
                console.log(JSON.stringify(record));
                const chargeResponse = record.data.appUsageRecordCreate.userErrors;
                if (!chargeResponse || !chargeResponse.length) {
                    status = false;
                    data  = record.data;
                    statusCode = 200;
                    let dataString = {
                        shop: shop,
                        order_id: orderNumber,
                        charge_type: 'Compliance Rules',
                        usageCharge_id: record.data.appUsageRecordCreate.appUsageRecord.id,
                        price: record.data.appUsageRecordCreate.appUsageRecord.price.amount
                    }
                    const saveCharge = await shopifyService.saveCharge(dataString);
                }
                else {
                    status = true;
                    data  = null;
                    statusCode = 400;
                }
                return await status;
            }   
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    appUsageCharges: async (req, res) => {
        console.log('------Shopify App Tracking picked up Charge ------');
        const childAccount = req.body.childAccount;
        const orderNumber = req.body.orderNumber;
        const cubeNumber = req.body.cubeNumber;
        const shipmentWeight = req.body.shipmentWeight;
        const carrierName = req.body.carrierName;
        console.log('-----------Parameters-----------');
        console.log(childAccount);
        console.log(orderNumber);
        console.log(cubeNumber);
        console.log(shipmentWeight);

        Shop.findOne({
            childAccount: childAccount
        }, async (err, response) => {
            if(err) {
                return await false;
            }
            if(response) {
                console.log('---------response----------');
                console.log(response);
                const shop = response.shopname;
                let status = "";
                let data = "";
                let statusCode = "";
                let chargePrice = 0;
                let quantity = 0;
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                const shopResponse = await shopifyService.shop(shop, response.accessToken);
                const orderResponse = await complianceService.getOrderDetail(orderNumber, accessToken.data);
                console.log('---------order detail----------');
                console.log(JSON.stringify(orderResponse));
                let dataString = await shopifyApiService.transformCostObject(orderResponse, shopResponse, shipmentWeight);
                console.log('---------shippingobject----------');
                console.log(JSON.stringify(dataString));
                const shippingCost = await complianceService.shippingCost(dataString, accessToken.data);
                console.log('---------shippingData----------');
                console.log(JSON.stringify(shippingCost));
                if(shippingCost.error === false) {
                    let shippers = shippingCost.data.shipCosting.shippers;
                    console.log('---------shippers----------');
                    console.log(JSON.stringify(shippers));
                    let carrier_name = carrierName;
                    console.log('---------carrier----------');
                    console.log(carrier_name);
                    if(carrier_name !== undefined) {
                        shippers.forEach(function(item) {
                            if(item.shipperID.toLowerCase() === carrier_name.toLowerCase()) {
                                chargePrice = item.costShip;
                            }
                        });
                        
                    }
                }
                console.log('---------price----------');
                console.log(chargePrice);
                const subscriptionRecord = await shopifyService.checkSubscriptionStatus(shop);
                const checkUsageCharge = await shopifyService.checkUsageCharge(shop, cubeNumber);
                if(checkUsageCharge === null && chargePrice > 0) {
                    const record = await shopifyService.appUsageCharge(shop, response.accessToken, subscriptionRecord.charge_id, chargePrice);
                    console.log(JSON.stringify(record));
                    const chargeResponse = record.data.appUsageRecordCreate.userErrors;
                    if (!chargeResponse || !chargeResponse.length) {
                        status = false;
                        data  = record.data;
                        statusCode = 200;
                        let dataString = {
                            shop: shop,
                            order_id: orderNumber,
                            charge_type: 'Shipping Charges',
                            cubeNumber: cubeNumber,
                            usageCharge_id: record.data.appUsageRecordCreate.appUsageRecord.id,
                            price: record.data.appUsageRecordCreate.appUsageRecord.price.amount
                        }
                        const saveCharge = await shopifyService.saveCharge(dataString);
                    }
                    else {
                        status = true;
                        data  = null;
                        statusCode = 400;
                    }
                    return res.status(200).json(
                        {
                            error: status,
                            data: data,
                            statusCode: statusCode,
                            messages: chargeResponse
                        }
                    );
                }
                else {
                    return res.status(200).json(
                        {
                            error: true,
                            data: null,
                            statusCode: 400,
                            messages: 'Charge already created'
                        }
                    );
                }
            }   
        });
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    updateCarrier: async (req, res) => {
        console.log('------Carrier Shipment Creation------');
        const orderNumber = req.body.order_id;
        const carrier = req.body.carrier;
        const shop = req.body.shop;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return await false;
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                if(accessToken.error === false) {
                    const orderResponse = await complianceService.getOrderDetail(orderNumber, accessToken.data);
                    if(orderResponse.error === false) {
                        const dataString = await shopifyApiService.updateOrderObject(orderResponse.data, carrier);
                        const updateOrder = await complianceService.updateOrderfulfillment(accessToken.data, dataString, orderNumber);
                        console.log(JSON.stringify(updateOrder));
                        if(updateOrder.error === false) {
                            return res.status(200).json({
                                error: false,
                                order: updateOrder,
                                orderNumber: orderNumber
                            });
                        }
                        else {
                            return res.status(200).json({
                                error: true,
                                order: updateOrder,
                            });
                        }
                    }
                    else {
                        return res.status(200).json({
                            error: true,
                            order: orderResponse
                        });
                    }
                }
                else {
                    return res.status(200).json({
                        error: true,
                        order: accessToken
                    });
                }
            }   
        });
    },

    /**
     * @param order
     * @param carrier
     * @returns {Promise<*>}
     */
    updateOrderObject: async (order, carrier) => {
        let orderData = {
            "orderNumber": order.orderNumber,
            "orderStatus": 'Completed',
            "orderDate": order.orderDate,
            "purchaser": {
                "firstName": order.purchaser.firstName,
                "lastName": order.purchaser.lastName,
                "company": order.purchaser.company,
                "address1": order.purchaser.address1,
                "address2": order.purchaser.address2,
                "city": order.purchaser.city,
                "state": order.purchaser.state,
                "country": order.purchaser.country,
                "zip": order.purchaser.zip,
                "email": order.purchaser.email,
                "mobilePhone": order.purchaser.mobilePhone,
                "dob": order.purchaser.dob,
                "textOptIn": "Unknown",
                "emailOptIn": "Unknown"
            },
            "recipient": {
                "firstName": order.recipient.firstName,
                "lastName": order.recipient.lastName,
                "company": order.recipient.company,
                "address1": order.recipient.address1,
                "address2": order.recipient.address2,
                "city": order.recipient.city,
                "state": order.recipient.state,
                "country": order.recipient.country,
                "zip": order.recipient.zip,
                "email": order.recipient.email,
                "mobilePhone": order.recipient.mobilePhone,
                "dob": order.recipient.dob,
                "textOptIn": "Unknown",
                "emailOptIn": "Unknown"
            },
            "carrier": {
                "name": carrier,
                "userCode": "GND",
                "tracking": "",
            },
            "merchantId": "",
            "deliveryDate": order.deliveryDate,
            "packageWeight": order.packageWeight,
            "totalShipment": order.totalShipment,
            "products": order.products.map(item => {
                return {
                    "productSKU": item.productSKU,
                    "name": item.name,
                    "quantity": item.quantity,
                    "soldUnitPrice": item.soldUnitPrice
                };
            }),
            "orderTotal": order.orderTotal,
            "productTotalPrice": order.productTotalPrice,
            "totalDiscount": order.totalDiscount,
            "productSalesTaxCollected": order.productSalesTaxCollected,
            "freightTotal": order.freightTotal,
            "freightSalesTaxCollected": 0,
            "salesTaxTotal": 0,
            "midNumber": "",
            "payment": {
                "date": order.orderDate
            },
            "shipment": {
                "date": ""
            },
            "fulfillmentLocationName": "",
            "createShipment": true,
            "saveTax": false,
            "adjustmentReason": "",
            "adjustmentDescription": "",
            "code": "",
            "companyCode": "DEFAULT",
            "type": "SalesInvoice",
            "customerCode": order.recipient.email
        };

        return orderData;
    },

    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    viewCharges: async (req, res) => {
        console.log('--------------APP Charges--------------');
        const shop = req.body.shop;
        const orderNumber = req.body.order_id;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return false;
            }
            if(response) {
                let error = false;
                let data = null;
                const charges = await shopifyService.getCharges(shop, orderNumber);
                console.log(JSON.stringify(charges));
                if(charges !== null && charges.length > 0) {
                    error = false;
                    data = charges;
                }
                else {
                    error = true;
                    data = null;
                }
                return res.status(200).json({
                    error: error,
                    data: data
                });
            }   
        });
    },

    /**
     * @param res
     * @param req
     * @returns {Promise<*>}
     */
    getAllLabels: async (req, res) => {
        console.log('------Get ALl labels------');
        const shop = req.body.shop;
        const orderNumber = req.body.order_id;
        Shop.findOne({
            shopname: shop
        }, async (err, response) => {
            if(err) {
                return false;
            }
            if(response) {
                const accessToken = await complianceService.verifyComplianceRequest(response.api_username, response.api_password);
                if(accessToken.error === false) {
                    const getCubes = await complianceService.getCubes(orderNumber, accessToken.data);
                    if(getCubes.error === false) {
                        let cubes = getCubes.data;
                        let count = 0;
                        do {
                            let labels = await complianceService.getLabel(orderNumber, cubes[count].cubeNumber, accessToken.data);
                            console.log(JSON.stringify(labels));
                            count=count+1;
                        }
                        while(count < cubes.length);
                        
                        return res.status(200).json({
                            error: false,
                            cubes: getCubes.data,
                        });
                    }
                    else {
                        return res.status(200).json({
                            error: true
                        });
                    }
                }
                else {
                    return res.status(200).json({
                        error: true
                    });
                }
            }
        });
    },

    /**
     * @param orderResponse
     * @param shopResponse
     * @param weight
     * @returns {Promise<*>}
     */
    transformCostObject: async (orderResponse, shopResponse, weight) => {
        let to_address2 = "";
        if(orderResponse.data.recipient.address2 !== null) {
            to_address2 = orderResponse.data.recipient.address2;
        }
        let dataString = {
            "customer_id": "VVNO",
            "shipCosting": {
            "shipToAddress": {
                "address1": orderResponse.data.recipient.address1,
                "address2": to_address2,
                "city": orderResponse.data.recipient.city,
                "state": orderResponse.data.recipient.state,
                "postal_code": orderResponse.data.recipient.zip,
                "country": orderResponse.data.recipient.country
            },
            "shipFromAddress": {
                "address1": shopResponse.shop.address1,
                "address2": "",
                "city": shopResponse.shop.city,
                "state": shopResponse.shop.province_code,
                "postal_code": shopResponse.shop.zip,
                "country": shopResponse.shop.country_name
            },
            "weight": weight
            }
        }

        return dataString;
    },
}

module.exports = shopifyApiService;
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
require("dotenv").config();
const discord = require("discord.js");
const { Observable, distinct } = require("rxjs");
const { MessageEmbed, Intents } = require("discord.js");
require("discord-reply"); //⚠️ IMPORTANT: put this before your discord.Client()
const client = new discord.Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});
const promiseRetry = require("promise-retry");
const axios = require("axios");
const { chunk } = require("lodash");
const moment = require("moment");
const { default: RPCWatcher } = require("./RPCWatcher");
const wsClientsRPCs = process.env.RPC_URLS.split(",");
if (!wsClientsRPCs.length) {
    throw new Error("No env RPC_URLS provided!");
}
const API_URL = process.env.API_URL;
if (!API_URL) {
    throw new Error("No env API_URL provided!");
}
const DISCORD_BOT_AUTH = process.env.DISCORD_BOT_AUTH;
if (!DISCORD_BOT_AUTH) {
    throw new Error("No env DISCORD_BOT_AUTH provided!");
}
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
if (!DISCORD_CHANNEL_ID) {
    throw new Error("No env DISCORD_CHANNEL_ID provided!");
}
const RAFFLE_CONTRACT_ADDR = process.env.RAFFLE_CONTRACT_ADDR;
if (!RAFFLE_CONTRACT_ADDR) {
    throw new Error("No env RAFFLE_CONTRACT_ADDR provided!");
}
const RAFFLE_ACTIONS = {
    modify_raffle: "Edited Raffle",
    create_raffle: "New Raffle",
    cancel_raffle: "Cancelled Raffle",
    claim: "Claimed Raffle",
};
(() => {
    const subscription = new Observable((subscriber) => {
        wsClientsRPCs.map((url) => __awaiter(void 0, void 0, void 0, function* () {
            const watcher = new RPCWatcher({
                url: url,
            });
            watcher.registerSubscriber(`wasm._contract_address=${RAFFLE_CONTRACT_ADDR}`, (data) => __awaiter(void 0, void 0, void 0, function* () {
                const tx = data.value.TxResult;
                subscriber.next(tx);
            }));
            yield watcher.start();
        }));
    });
    subscription.pipe(distinct((tx) => tx.txhash)).subscribe((tx) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const raffleTx = Object.assign({ txhash: tx.txhash }, Object.fromEntries(JSON.parse(tx.result.log)
            .flatMap((x) => x.events)
            .filter((x) => x.type === "wasm")
            .flatMap((x) => x.attributes)
            .filter(({ value }) => !["transfer_nft"].includes(value))
            .filter((x) => ["raffle_id", "action"].includes(x.key))
            .map(({ key, value }) => [key, value])));
        const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
        const { raffle_id: raffleId, action } = raffleTx !== null && raffleTx !== void 0 ? raffleTx : {};
        if (!Object.keys(RAFFLE_ACTIONS).includes(action) || !raffleId || !action) {
            return;
        }
        const raffleResponse = yield promiseRetry({ minTimeout: 350, retries: 10, factor: 2, randomize: true }, (retry) => axios.patch(`${API_URL}/raffles?network=mainnet&raffleId=${raffleId}`).catch(retry));
        const { raffleInfo: { winner, raffleTicketPrice, raffleOptions, allAssociatedAssets }, } = raffleResponse.data;
        const { rafflePreview, raffleStartDate, raffleDuration, maxParticipantNumber } = raffleOptions !== null && raffleOptions !== void 0 ? raffleOptions : {};
        const { cw721Coin } = rafflePreview !== null && rafflePreview !== void 0 ? rafflePreview : {};
        const { name, collectionName, traits, imageUrl } = cw721Coin !== null && cw721Coin !== void 0 ? cw721Coin : {};
        const started = moment(raffleStartDate).unix();
        const endsIn = moment(raffleStartDate)
            .add(raffleDuration !== null && raffleDuration !== void 0 ? raffleDuration : 0, "seconds")
            .unix();
        if (channel === null || channel === void 0 ? void 0 : channel.isText()) {
            let embad = new MessageEmbed()
                .setColor("#0099ff")
                .setTitle(`${RAFFLE_ACTIONS[action]} ${raffleId} `)
                .setURL(`https://www.illiquidlabs.io/en/raffle-listing-details/?raffleId=${raffleId}`)
                .addFields({
                name: `Transaction`,
                value: `https://finder.terra.money/mainnet/tx/${raffleTx.txhash}`,
            })
                .addFields({
                name: `Assets`,
                value: `${allAssociatedAssets.length} ${allAssociatedAssets.length === 1 ? "NFT" : "NFTs"}`,
            })
                .addFields({
                name: "Collection",
                value: collectionName || "Unknown Collection",
            })
                .addFields({
                name: "Name",
                value: name || "Unknown Name",
            })
                .addFields({
                name: `Raffle Start Date`,
                value: `<t:${started}:R>`,
            })
                .addFields({
                name: `Raffle End Date`,
                value: `<t:${endsIn}:R>`,
            })
                .addFields({
                name: "Ticket Supply",
                value: `${maxParticipantNumber !== null && maxParticipantNumber !== void 0 ? maxParticipantNumber : 0}`,
            })
                .addFields({
                name: `Ticket Price`,
                value: ` ${(_d = (_b = (_a = raffleTicketPrice === null || raffleTicketPrice === void 0 ? void 0 : raffleTicketPrice.coin) === null || _a === void 0 ? void 0 : _a.amount) !== null && _b !== void 0 ? _b : (_c = raffleTicketPrice === null || raffleTicketPrice === void 0 ? void 0 : raffleTicketPrice.cw20Coin) === null || _c === void 0 ? void 0 : _c.amount) !== null && _d !== void 0 ? _d : 0} ${(_h = (_f = (_e = raffleTicketPrice === null || raffleTicketPrice === void 0 ? void 0 : raffleTicketPrice.coin) === null || _e === void 0 ? void 0 : _e.currency) !== null && _f !== void 0 ? _f : (_g = raffleTicketPrice === null || raffleTicketPrice === void 0 ? void 0 : raffleTicketPrice.cw20Coin) === null || _g === void 0 ? void 0 : _g.currency) !== null && _h !== void 0 ? _h : ""}`,
            });
            if (winner) {
                embad = embad.addFields({
                    name: `Winner`,
                    value: winner,
                });
            }
            const traitChunks = chunk(traits !== null && traits !== void 0 ? traits : [], 3);
            traitChunks.forEach((ch, index) => {
                ch.forEach(([key, value]) => {
                    embad = embad.addFields({
                        name: key,
                        value,
                        inline: true,
                    });
                });
                if (index !== traitChunks.length - 1) {
                    embad = embad.addFields({ name: "\u200B", value: "\u200B" });
                }
            });
            if (imageUrl === null || imageUrl === void 0 ? void 0 : imageUrl[0]) {
                embad = embad.setImage(imageUrl === null || imageUrl === void 0 ? void 0 : imageUrl[0]);
            }
            embad = embad
                .setTimestamp()
                .setFooter("Powered by @LuckyMario", "https://d1mx8bduarpf8s.cloudfront.net/bafkreicliagvqjxa5ylgcgrgsw3zx4wqwipfhvewfyn7wqwdpk34i62njq");
            yield promiseRetry({ minTimeout: 250, retries: 5, factor: 2, randomize: true }, (retry) => channel.send({ embeds: [embad] }).catch(retry));
        }
    }));
})();
client.on("ready", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log(client.user.tag);
}));
client.login(DISCORD_BOT_AUTH);

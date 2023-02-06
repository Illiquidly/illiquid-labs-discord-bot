require("dotenv").config();

const { WebSocketClient } = require("@terra-money/terra.js");
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
    wsClientsRPCs.forEach((url) => {
      const wsClient = new WebSocketClient(url, -1);

      wsClient.subscribeTx({ "wasm._contract_address": RAFFLE_CONTRACT_ADDR }, async (data) => {
        const tx = data.value.TxResult;

        subscriber.next(tx);
      });
      wsClient.start();
    });
  });

  subscription.pipe(distinct((tx) => tx.txhash)).subscribe(async (tx) => {
    const raffleTx = {
      txhash: tx.txhash,
      ...Object.fromEntries(
        JSON.parse(tx.result.log)
          .flatMap((x) => x.events)
          .filter((x) => x.type === "wasm")
          .flatMap((x) => x.attributes)
          .filter(({ value }) => !["transfer_nft"].includes(value))
          .filter((x) => ["raffle_id", "action"].includes(x.key))
          .map(({ key, value }) => [key, value])
      ),
    };

    const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);

    const { raffle_id: raffleId, action } = raffleTx ?? {};

    if (!Object.keys(RAFFLE_ACTIONS).includes(action) || !raffleId || !action) {
      return;
    }

    const raffleResponse = await promiseRetry({ minTimeout: 350, retries: 10, factor: 2, randomize: true }, (retry) =>
      axios.patch(`${API_URL}/raffles?network=mainnet&raffleId=${raffleId}`).catch(retry)
    );

    const {
      raffleInfo: { winner, raffleTicketPrice, raffleOptions, allAssociatedAssets },
    } = raffleResponse.data;

    const { rafflePreview, raffleStartDate, raffleDuration, maxParticipantNumber } = raffleOptions ?? {};

    const { cw721Coin } = rafflePreview ?? {};

    const { name, collectionName, traits, imageUrl } = cw721Coin ?? {};

    const started = moment(raffleStartDate).unix();

    const endsIn = moment(raffleStartDate)
      .add(raffleDuration ?? 0, "seconds")
      .unix();

    if (channel?.isText()) {
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
          value: `${maxParticipantNumber ?? 0}`,
        })
        .addFields({
          name: `Ticket Price`,
          value: ` ${raffleTicketPrice?.coin?.amount ?? raffleTicketPrice?.cw20Coin?.amount ?? 0} ${
            raffleTicketPrice?.coin?.currency ?? raffleTicketPrice?.cw20Coin?.currency ?? ""
          }`,
        });

      if (winner) {
        embad = embad.addFields({
          name: `Winner`,
          value: winner,
        });
      }

      const traitChunks = chunk(traits ?? [], 3);
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

      if (imageUrl?.[0]) {
        embad = embad.setImage(imageUrl?.[0]);
      }

      embad = embad
        .setTimestamp()
        .setFooter(
          "Powered by @LuckyMario",
          "https://d1mx8bduarpf8s.cloudfront.net/bafkreicliagvqjxa5ylgcgrgsw3zx4wqwipfhvewfyn7wqwdpk34i62njq"
        );

      await promiseRetry({ minTimeout: 250, retries: 5, factor: 2, randomize: true }, (retry) =>
        channel.send({ embeds: [embad] }).catch(retry)
      );
    }
  });
})();

client.on("ready", async () => {
  console.log(client.user.tag);
});

client.login(DISCORD_BOT_AUTH);

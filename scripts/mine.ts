import { Address, TonClient, toNano } from "@ton/ton";
import { unixNow } from "../lib/utils";
import { MineMessageParams, Queries } from "../wrappers/NftGiver";
// Преобразует TON в нанокои (1 TON = 1e9 нанокои)
import { NetworkProvider } from "@ton/blueprint";
// Инструмент для работы с сетью (Testnet/Mainnet) и кошельком

const walletAddress = Address.parse(
  "UQBmgoUnV8_m565DFw0AVMrTpAKXUEMEEgvrAWNMPDGGNajD"
);
const collectionAddress = Address.parse(
  "EQDk8N7xM5D669LC2YACrseBJtDyFqwtSPCNhRWXU7kjEptX"
);

async function mine() {
  // specify endpoint for Testnet
  //   const endpoint = "https://testnet.toncenter.com/api/v2/jsonRPC";

  // specify endpoint for Mainnet
  const endpoint = "https://toncenter.com/api/v2/jsonRPC";

  // initialize ton library
  const client = new TonClient({ endpoint });

  const miningData = await client.runMethod(
    collectionAddress,
    "get_mining_data"
  );

  const { stack } = miningData; // stack имеет тип TupleReader, const stack = miningData.stack;

  const complexity = stack.readBigNumber();
  const lastSuccess = stack.readBigNumber();
  const seed = stack.readBigNumber();
  const targetDelta = stack.readBigNumber();
  const minCpl = stack.readBigNumber();
  const maxCpl = stack.readBigNumber();

  console.log({ complexity, lastSuccess, seed, targetDelta, minCpl, maxCpl });

  const mineParams: MineMessageParams = {
    expire: unixNow() + 300, // 5 min is enough to make a transaction
    mintTo: walletAddress, // your wallet
    data1: 0n, // temp variable to increment in the miner
    seed, // unique seed from get_mining_data
  };

  let msg = Queries.mine(mineParams); // transaction builder - это ячейка (Cell)
  // [OpCode (4 байта)]
  // [expire (4 байта)]
  // [mintTo (34 байта)]
  // [data1 (32 байта)]
  // [seed (16 байт)]
  // [data2 (32 байта)]

  const bufferToBigint = (buffer: Buffer) =>
    BigInt("0x" + buffer.toString("hex"));

  //   console.log(msg); // transaction object
  //   console.log(msg.hash()); // transaction hash
  //   console.log(bufferToBigint(msg.hash())); // transaction hash as bigint

  let progress = 0;

  // .hash()
  // Вычисляет хэш ячейки по алгоритму SHA-256 (стандарт TON)
  // Возвращает результат как Buffer
  while (bufferToBigint(msg.hash()) > complexity) {
    console.clear();
    console.log(
      "Майнинг запущен... Подождите, это может занять некоторое время."
    );
    console.log();
    console.log(
      `⛏ Ты смайнил ${progress} хэшей! Последний: `,
      bufferToBigint(msg.hash())
    ); // последний хэш

    progress += 1;

    mineParams.expire = unixNow() + 300;
    mineParams.data1 += 1n;
    msg = Queries.mine(mineParams);
  }

  console.log();
  console.log(
    "💎 Ураа!! Миссия выполнена: msg_hash, который меньше, чем pow_complexity, найден!"
  );
  console.log();
  console.log("msg_hash:       ", bufferToBigint(msg.hash()));
  console.log("pow_complexity: ", complexity);
  console.log(
    "msg_hash < pow_complexity: ",
    bufferToBigint(msg.hash()) < complexity
  );

  return msg;
}

export async function run(provider: NetworkProvider) {
  // Вызываем функцию майнинга, чтобы получить сообщение с валидным PoW
  const msg = await mine();

  // Отправляем транзакцию через провайдер
  await provider.sender().send({
    to: collectionAddress, // Адрес NFT-коллекции куда отправляем транзакцию
    value: toNano(0.05), // Количество TON для прикрепления к транзакции (газ и накладные расходы)
    body: msg, // Сообщение для контракта (решение PoW) для вызова метода mine() в контракте.
  });
}

// Что происходит после отправки?
// Транзакция попадает в мемпул блокчейна.
// Валидаторы проверяют:
// - Корректность PoW (хэш < complexity).
// - Актуальность seed и expire.
// Если всё верно:
// - Контракт создаёт NFT для вашего mintTo-адреса.
// - Транзакция включается в блок.

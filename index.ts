import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const PROVIDER = "https://rpc.mainnet.taraxa.io/";
const CONTRACT_ADDRESS = "0x00000000000000000000000000000000000000fe";
const ABI = [
  'event CommissionRewardsClaimed(address indexed,address indexed,uint256)',
  'event CommissionSet(address indexed,uint16)',
  'event Delegated(address indexed,address indexed,uint256)',
  'event Redelegated(address indexed,address indexed,address indexed,uint256)',
  'event RewardsClaimed(address indexed,address indexed,uint256)',
  'event UndelegateCanceled(address indexed,address indexed,uint256)',
  'event UndelegateConfirmed(address indexed,address indexed,uint256)',
  'event Undelegated(address indexed,address indexed,uint256)',
  'event ValidatorInfoSet(address indexed)',
  'event ValidatorRegistered(address indexed)',
  'function cancelUndelegate(address)',
  'function claimAllRewards(uint32) returns (bool)',
  'function claimCommissionRewards(address)',
  'function claimRewards(address)',
  'function confirmUndelegate(address)',
  'function delegate(address) payable',
  'function getDelegations(address,uint32) view returns ((address,(uint256,uint256))[],bool)',
  'function getTotalDelegation(address) view returns (uint256)',
  'function getTotalEligibleVotesCount() view returns (uint64)',
  'function getUndelegations(address,uint32) view returns ((uint256,uint64,address,bool)[],bool)',
  'function getValidator(address) view returns ((uint256,uint256,uint16,uint64,uint16,address,string,string))',
  'function getValidatorEligibleVotesCount(address) view returns (uint64)',
  'function getValidators(uint32) view returns ((address account, (uint256,uint256,uint16,uint64,uint16,address,string,string) info)[],bool)',
  'function getValidatorsFor(address,uint32) view returns ((address,(uint256,uint256,uint16,uint64,uint16,address,string,string))[],bool)',
  'function isValidatorEligible(address) view returns (bool)',
  'function reDelegate(address,address,uint256)',
  'function registerValidator(address,bytes,bytes,uint16,string,string) payable',
  'function setCommission(address,uint16)',
  'function setValidatorInfo(address,string,string)',
  'function undelegate(address,uint256)'
];

interface ValidatorBasicInfo {
  // Total number of delegated tokens to the validator
  total_stake: BigInt;
  // Validator's reward from delegators rewards commission
  commission_reward: BigInt;
  // Validator's commission - max value 10000(precision up to 0.01%)
  commission: BigInt;
  // Block number of last commission change
  last_commission_change: BigInt;
  // Number of ongoing undelegations from the validator
  undelegations_count: BigInt;
  // Validator's owner account
  owner: string;
  // Validators description/name
  description: string;
  // Validators website endpoint
  endpoint: string;
}

// Retun value for getValidators method
interface ValidatorData {
  account: string;
  info: ValidatorBasicInfo;
}

const wsProvider = new JsonRpcProvider(PROVIDER);

const privateKey = process.env.WALLET_PRIVATE_KEY || "";
const signer = new Wallet(privateKey, wsProvider);

const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);

async function main() {
  await checkCurrentNodes();
  await listenForNewEvents();
}

async function checkCurrentNodes() {
  console.log("Checking existing nodes...");
  const validators = await getValidators();
  const emptyValidators = validators.filter((validator) => validator.info.total_stake === BigInt(0));
  const emptyValidatorsWithCommissionReward = emptyValidators.filter((validator) => validator.info.commission_reward.valueOf() > BigInt(0));

  console.log(`Found ${emptyValidatorsWithCommissionReward.length} validators with no stake that have a commission reward`);

  for (const validator of emptyValidatorsWithCommissionReward) {
    await delegate(validator);
  }
}

async function listenForNewEvents() {
  contract.on("Undelegated", (delegator, validator, amount) => {
    console.log(`Undelegated ${amount} from ${validator} to ${delegator}`);

    getValidator(validator).then((validatorData) => {
      if (validatorData.info.total_stake === BigInt(0)) {
        delegate(validatorData);
      }
    });

  });
}

async function delegate(validator: ValidatorData) {
  console.log(`Delegating to validator ${validator.account}...`);
  const tx = await contract.delegate(validator.account, { value: BigInt(1000) * BigInt(10) ** BigInt(18) });
  await tx.wait();
}

async function getValidators(): Promise<ValidatorData[]> {
  let validators: ValidatorData[] = [];
  let isDone = false;
  let index = 0;
  while (!isDone) {
    const [newValidators, end] = await contract.getValidators(index);
    validators = validators.concat(newValidators);
    isDone = end;
    index++;
  }
  return validators.map((validator) => ({
    account: validator[0],
    info: {
      total_stake: validator[1][0],
      commission_reward: validator[1][1],
      commission: validator[1][2],
      last_commission_change: validator[1][3],
      undelegations_count: validator[1][4],
      owner: validator[1][5],
      description: validator[1][5],
      endpoint: validator[1][6]
    }
  }));
}

async function getValidator(address: string): Promise<ValidatorData> {
  const validator = await contract.getValidator(address);
  return {
    account: address,
    info: {
      total_stake: validator[0],
      commission_reward: validator[1],
      commission: validator[2],
      last_commission_change: validator[3],
      undelegations_count: validator[4],
      owner: validator[5],
      description: validator[5],
      endpoint: validator[6]
    }
  };
}

main();
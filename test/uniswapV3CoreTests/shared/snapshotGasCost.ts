import { expect } from './expect'
import {
    Contract,
    ContractTransaction,
    ContractTransactionReceipt,
    ContractTransactionResponse,
} from "ethers";

export default async function snapshotGasCost(
    x:
        | ContractTransactionResponse
        | Promise<ContractTransactionResponse>
        | ContractTransaction
        | Promise<ContractTransaction>
        | ContractTransactionReceipt
        | Contract
        | Promise<Contract>
        | Promise<bigint>
        | bigint,
): Promise<void> {
    const resolved = await x;
    if (typeof resolved === "bigint") {
        expect(Number(resolved)).toMatchSnapshot();
    } else if ("deployTransaction" in resolved) {
        const receipt = await resolved.waitForDeployment();
        expect(Number(receipt.gasUsed)).toMatchSnapshot();
    } else if ("wait" in resolved) {
        const waited = await resolved.wait();
        expect(Number(waited.gasUsed)).toMatchSnapshot();
    }
}

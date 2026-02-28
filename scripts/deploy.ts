import { ethers } from "hardhat";

async function main() {
    console.log("Deploying CandyBlitz...");

    const CandyBlitz = await ethers.getContractFactory("CandyBlitz");
    const contract = await CandyBlitz.deploy();
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log(`CandyBlitz deployed to: ${address}`);
    console.log(`Verify: npx hardhat verify --network baseSepolia ${address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

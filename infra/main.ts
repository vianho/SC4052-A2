import { Construct } from "constructs";
import { App, TerraformStack } from "cdktn";
import {
  AzapiProvider,
  NetworkInterface,
  NetworkSecurityGroup,
  ResourceGroup,
  RoleAssignment,
  StorageAccount,
  Subnet,
  VirtualMachine,
  VirtualNetwork,
} from "@microsoft/terraform-cdk-constructs";
import * as fs from "fs";
import * as path from "path";
// import { StorageContainer } from "@cdktn/provider-azurerm/lib/storage-container";
// import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";

class PagerankStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    // Azure for students allowed locations: ["centralindia","southeastasia","koreacentral","indonesiacentral","japaneast"]
    const locationCode = "koreacentral";
    const tags = {
      project: "pagerank",
      managed_by: "cdktn",
    }

    // new AzurermProvider(this, "Azurerm", {
    //   features: undefined
    // });
    new AzapiProvider(this, "AzApi", {
      defaultTags: tags,
    });

    const sshPublicKey = process.env.SSH_PUBLIC_KEY || "";
    if (!sshPublicKey) {
      throw new Error("SSH_PUBLIC_KEY environment variable is not set");
    }

    // 1. create a resource group
    const rg = new ResourceGroup(this, "rg", {
      name: "pagerank-rg",
      location: locationCode,
    });

    // 2. setup storage
    const storageAccount = new StorageAccount(this, "storage", {
      name: "sc4052assignment2",
      resourceGroupId: rg.id,
      location: rg.location,
      sku: { name: "Standard_LRS" },
    });

    // new StorageContainer(this, "datasetContainer", {
    //   name: "pagerank-dataset",
    //   storageAccountName: storageAccount.name,
    //   containerAccessType: "private",
    // });

    // 3. setup network
    const vnet = new VirtualNetwork(this, "vnet", {
      name: "vnet",
      resourceGroupId: rg.id,
      location: rg.location,
      addressSpace: {
        addressPrefixes: ["10.0.0.0/16"],
      }
    });

    const snet1 = new Subnet(this, "snet1", {
      name: "snet-app-mywest-01",
      virtualNetworkName: vnet.name,
      virtualNetworkId: vnet.id,
      resourceGroupId: rg.id,
      addressPrefix: "10.0.1.0/24",
    });

    const nsg = new NetworkSecurityGroup(this, "nsg", {
      name: "sc4052-nsg-22",
      resourceGroupId: rg.id,
      location: rg.location,
      securityRules: [
        {
          name: "SSH",
          properties: {
            priority: 100,
            direction: "Inbound",
            description: "Allow SSH from anywhere",
            access: "Allow",
            protocol: "Tcp",
            sourcePortRange: "*",
            destinationPortRange: "22",
            sourceAddressPrefix: "*",
            destinationAddressPrefix: "*",
          },
        },
      ],
    });

    const nic = new NetworkInterface(this, "nic", {
      name: "sc4502-2526a2-nic",
      location: rg.location,
      resourceGroupId: rg.id,
      networkSecurityGroup: {
        id: nsg.id,
      },
      ipConfigurations: [{
        name: "ipconfig1",
        subnet: { id: snet1.id },
        privateIPAllocationMethod: "Dynamic",
        primary: true,
      }],
    });

    // pre-4. read cloud-init script and replace placeholder with actual storage account name
    const scriptPath = path.resolve(__dirname, "scripts", "cloud-init.sh");
    const rawScript = fs.readFileSync(scriptPath, "utf-8");
    const userData = rawScript.replace("__STORAGE_ACCOUNT_NAME__", storageAccount.name);

    // 4. create vm
    const vm = new VirtualMachine(this, "vm", {
      name: "sc4052-2526a2",
      location: rg.location,
      resourceGroupId: rg.id,
      hardwareProfile: {
        vmSize: "Standard_B2als_v2",
      },
      storageProfile: {
        imageReference: {
          publisher: "Canonical",
          offer: "ubuntu-24_04-lts",
          sku: "minimal",
          version: "latest"
        },
        osDisk: {
          createOption: "FromImage",
          managedDisk: {
            storageAccountType: "Standard_LRS",
          },
        },
      },
      osProfile: {
        computerName: "sc4052",
        adminUsername: "azureuser",
        linuxConfiguration: {
          disablePasswordAuthentication: true,
          ssh: {
            publicKeys: [
              {
                path: "/home/azureuser/.ssh/authorized_keys",
                keyData: sshPublicKey
              },
            ],
          },
        },
        customData: Buffer.from(userData).toString('base64'),
      },
      networkProfile: {
        networkInterfaces: [
          {
            id: nic.id,
          },
        ],
      },
      // no redundancy needed to save credits
      zones: ["1"],
      // Assign Managed Identity to access Blob Storage
      identity: {
        type: "SystemAssigned"
      }
    });

    // 5. assign blob storage data contributor role to vm
    new RoleAssignment(this, "vmStorageAccess", {
      name: 'sc4052-2526a2-storage-access',
      roleDefinitionId: "/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe",
      principalId: vm.vmId,
      scope: storageAccount.id,
      principalType: "ServicePrincipal",
      description: "Allow R/W access to Blob Storage for VM",
    });
  }
}

const app = new App();
new PagerankStack(app, "infra");
app.synth();

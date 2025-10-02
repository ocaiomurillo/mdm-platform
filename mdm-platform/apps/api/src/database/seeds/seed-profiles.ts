import "reflect-metadata";
import * as bcrypt from "bcryptjs";
import dataSource from "../ormconfig";
import { User } from "../../modules/auth/entities/user.entity";

const DEFAULT_PASSWORD = process.env.MDM_SEED_PASSWORD || "mdm123";

const PROFILE_CONFIG = [
  {
    email: "fiscal@mdm.local",
    name: "Fiscal",
    profile: "fiscal",
    responsibilities: ["partners.approval.fiscal"],
  },
  {
    email: "compras@mdm.local",
    name: "Compras",
    profile: "compras",
    responsibilities: ["partners.approval.compras"],
  },
  {
    email: "dados@mdm.local",
    name: "Dados Mestres",
    profile: "dados_mestres",
    responsibilities: ["partners.approval.dados_mestres"],
  },
  {
    email: "admin@mdm.local",
    name: "Administrador",
    profile: "admin",
    responsibilities: [
      "partners.approval.fiscal",
      "partners.approval.compras",
      "partners.approval.dados_mestres",
    ],
  },
];

async function run() {
  await dataSource.initialize();
  const usersRepo = dataSource.getRepository(User);
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  for (const config of PROFILE_CONFIG) {
    let user = await usersRepo.findOne({ where: { email: config.email } });
    if (!user) {
      user = usersRepo.create({
        email: config.email,
        passwordHash,
      });
    }

    user.displayName = config.name;
    user.profile = config.profile;
    user.responsibilities = config.responsibilities;
    if (!user.passwordHash) {
      user.passwordHash = passwordHash;
    }

    await usersRepo.save(user);
  }

  await dataSource.destroy();
  console.log("Seeded default profiles successfully");
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to seed profiles", error);
    dataSource.destroy().catch(() => undefined);
    process.exit(1);
  });

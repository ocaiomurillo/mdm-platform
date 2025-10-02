import bcrypt
hash = b'$2a$10$jCS9lDnNx2J6y66hR5VEgu4kSv9mx8nc.5DdvCoooTBy.Nt6Q.Hue'
for pwd in [b'admin', b'admin123', b'123456', b'secret', b'password', b'admin@123', b'Admin123', b'mdm123', b'adminmdm']:
    print(pwd.decode(), bcrypt.checkpw(pwd, hash))

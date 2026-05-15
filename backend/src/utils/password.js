import bcrypt from 'bcrypt'

const COST = 10

export const hashPassword = (plain) => bcrypt.hash(plain, COST)

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash)

export const PASSWORD_POLICY_MESSAGE = 'Password must be 8 to 72 characters and include 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 symbol.'
export const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,72}$/

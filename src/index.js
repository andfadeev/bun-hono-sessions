import {Hono} from 'hono'
import {getCookie, setCookie} from 'hono/cookie'
import {CookieStore, sessionMiddleware} from "hono-sessions";
import {generateState, OAuth2Client} from "oslo/oauth2";

const app = new Hono()

const store = new CookieStore()

// https://oslo.js.org/reference/oauth2/
// https://console.cloud.google.com/apis/dashboard?project=startupfellows-net
// https://lucia-auth.com/guidebook/github-oauth/
// https://github.com/lucia-auth/lucia/blob/main/packages/oauth/src/providers/google.ts
// https://auth0.com/docs/secure/attack-protection/state-parameters

const googleOAuth2Client = new OAuth2Client(
    Bun.env.GOOGLE_CLIENT_ID,
    "https://accounts.google.com/o/oauth2/v2/auth",
    "https://oauth2.googleapis.com/token",
    {
        redirectURI: "http://localhost:3000/login/google/callback"
    });

const getGoogleUser = async (accessToken) => {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo",
        {
            headers: { "Authorization": `Bearer ${accessToken}` },
        });
    return await response.json()
};

app.use('*', sessionMiddleware({
    store,
    encryptionKey: Bun.env.SESSION_ENCRYPTION_KEY,
    expireAfterSeconds: 900,
    cookieOptions: {
        path: '/',
        httpOnly: true
    },
}))

app.get('/', (c) => {

    const session = c.get('session')
    const user = session.get('user')

    return c.html(
        <html>
        <body>
        {user ?
            <>
                <div>User: {JSON.stringify(user)}</div>
                <a href={'/logout'}>Logout</a>
            </>
            : <div>
                <a href={'/login/google'}>Google Login</a>
            </div>
        }

        </body>
        </html>
    )
})
    .get('/login/google', async (c) => {

        const googleOAuth2State = generateState()

        const url = await googleOAuth2Client.createAuthorizationURL({
            state: googleOAuth2State,
            scopes: ["https://www.googleapis.com/auth/userinfo.profile"]
        });

        console.log(`Redirect url: ${url}`)

        setCookie(c,
            "google_oauth2_state",
            googleOAuth2State,
            {
                httpOnly: true,
                secure: false, // `true` for production
                path: "/",
                maxAge: 60 * 60
            })

        return c.redirect(url.toString() + '&prompt=select_account')

    })
    .get('/login/google/callback', async (c) => {

        const {state, code} = c.req.query()
        const googleOAuth2State = getCookie(c, 'google_oauth2_state')

        if (!googleOAuth2State || !state || googleOAuth2State !== state) {
            return c.status(400)
        }

        console.log(`code: ${code}`)

        const {access_token} = await googleOAuth2Client.validateAuthorizationCode(
            code,
            {
                credentials: Bun.env.GOOGLE_CLIENT_SECRET,
                authenticateWith: "request_body"
            })

        console.log(`accessToken: ${access_token}`)

        const user = await getGoogleUser(access_token)

        console.log(`user: ${JSON.stringify(user)}`)

        // set user information to the session cookie
        const session = c.get('session')
        session.set('user', user)

        return c.redirect('/')
    })
    .get('/logout', (c) => {
        c.get('session').deleteSession()
        return c.redirect('/')
    })

export default app
